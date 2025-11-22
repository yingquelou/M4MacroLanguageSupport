import * as da from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { M4Runtime } from './M4Runtime';
export default class M4DebugSession extends da.DebugSession {
    private _runner: M4Runtime;
    private _launchConfig: any | undefined;
    private _waitForConfigurationDone: boolean = true;
    private _varRefCounter: number = 1000;
    private _variablesStore: Map<number, any> = new Map();
    private _divertsRef: number | null = null;
    private _eventsBound: boolean = false;
    constructor() {
        super();
        this._runner = new M4Runtime();
    }
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        // Report capabilities in the initialize response first
        response.body = {
            // minimal capabilities — expand as needed
            supportsConfigurationDoneRequest: true,
            supportsEvaluateForHovers: true,
            ...args
        } as any;

        this.sendResponse(response);

        // Then notify the client that the debug adapter is ready to accept
        // configuration (breakpoints, etc.). This ordering matches the
        // Debug Adapter Protocol expectations.
        this.sendEvent(new da.InitializedEvent());
    }
    BindEvent() {
        this._runner.on('Stopped', (...args) => {
            this.sendEvent(new da.StoppedEvent("breakpoint", this._runner.threadId));
        });
        this._runner.on('breakpointsValidated', (bps: any[]) => {
            try {
                bps.forEach((bp) => {
                    const breakpoint: DebugProtocol.Breakpoint = { verified: !!bp.verified, line: bp.line, source: bp.source } as any;
                    this.sendEvent(new da.BreakpointEvent('changed', breakpoint));
                });
            } catch (err) {
                // ignore
            }
        });
        this._runner.on('divertUpdated', (arg: any) => {
            try {
                // update stored divert list if present
                if (this._divertsRef) {
                    const cur = this._variablesStore.get(this._divertsRef) || [];
                    // find or update
                    const exist = cur.find((v: any) => v.name === `divert ${arg.stream}`);
                    const entryRef = exist ? exist.variablesReference : this._varRefCounter++;
                    const entry = { name: `divert ${arg.stream}`, value: `<${arg.content.length} chars>`, variablesReference: entryRef };
                    if (exist) {
                        // replace
                        const idx = cur.indexOf(exist);
                        cur[idx] = entry;
                    } else { cur.push(entry); }
                    this._variablesStore.set(this._divertsRef, cur);
                    // store the actual content under entryRef
                    this._variablesStore.set(entryRef, [{ name: 'content', value: arg.content, variablesReference: 0 }]);
                }
                // also send an OutputEvent to make the update visible
                this.sendEvent(new da.OutputEvent(`Divert[${arg.stream}] updated: ${arg.content.substring(0, 200)}\n`, 'console'));
            } catch (err) { }
        });
        this._runner.on('Output', ({ output, category, data }: { output: string, category?: string, data?: any }) => {
            this.sendEvent(new da.OutputEvent(output, category, data));
        });
        this._runner.on('Terminated', () => {
            this.sendEvent(new da.TerminatedEvent());
        });
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        try {
            if (this._runner && typeof (this._runner as any).stop === 'function') {
                try { (this._runner as any).stop(); } catch (e) { }
            }
        } catch (e) { }
        this.sendResponse(response);
    }

    protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments, request?: DebugProtocol.Request): void {
        try {
            if (this._runner && typeof (this._runner as any).stop === 'function') {
                try { (this._runner as any).stop(); } catch (e) { }
            }
        } catch (e) { }
        this.sendResponse(response);
    }
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: any, request?: DebugProtocol.Request): void {
        // Save launch args and wait for configurationDoneRequest before starting runtime.
        this._launchConfig = args;
        if (!this._waitForConfigurationDone) {
            this.startRuntimeFromLaunch(response);
        } else {
            // reply immediately; actual runtime start happens on configurationDoneRequest
            this.sendResponse(response);
        }
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments, request?: DebugProtocol.Request): void {
        // Client indicates that it has finished setting breakpoints and other configuration.
        if (this._launchConfig) {
            this.startRuntimeFromLaunch(response);
        } else {
            this.sendResponse(response);
        }
    }

    private startRuntimeFromLaunch(response: DebugProtocol.Response) {
        if (!this._eventsBound) {
            this.BindEvent();
            this._eventsBound = true;
        }
        try {
            this._runner.debug(this._launchConfig);
        } catch (err) {
            this.sendEvent(new da.OutputEvent(`Runtime start error: ${err}`));
        }
        this.sendResponse(response);
    }

    // protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request): void {
    //     this.sendResponse(response)
    // }


    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('next',()=>{
            this.sendResponse(response);
        });
    }
    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('evaluate', args.expression, (result?: string) => {
            const r = (result !== undefined && result !== null) ? String(result) : '';
            response.body = { result: r, variablesReference: 0 } as any;
            this.sendResponse(response);
        });
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('stepIn',()=>{
            this.sendResponse(response);
        });
    }
    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('stepOut',()=>{
            this.sendResponse(response);
        });
    }
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('continue');
        this.sendResponse(response);
    }
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): void {
        if (args.breakpoints) {
            response.body = {
                breakpoints: args.breakpoints.map((v, i) => {
                    // mark breakpoints as verified for now; M4Runtime will honor them
                    const bp: any = { source: args.source, ...v, verified: true };
                    return bp;
                })
            };
            this._runner.breakPoints = response.body.breakpoints;
            this.sendResponse(response);
        }
    }

    protected customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request): void {
        try {
            if (command === 'getDiverts') {
                this._runner.emit('getDiverts', (arr: any) => {
                    response.body = arr;
                    this.sendResponse(response);
                });
                return;
            }
        } catch (e) { }
        response.success = false;
        response.message = 'Unknown custom request';
        this.sendResponse(response);
    }
    // protected breakpointLocationsRequest(response: DebugProtocol.BreakpointLocationsResponse, args: DebugProtocol.BreakpointLocationsArguments, request?: DebugProtocol.Request): void {
    //     if (request) {
    //         response.body = {
    //             breakpoints: [args]
    //         };
    //         this.sendResponse(response);
    //         const se = new da.StoppedEvent("breakpoint", 1);

    //         this.sendEvent(se);
    //     }
    // }

    // sendResponse(response: DebugProtocol.Response): void {
    //     console.log(response.command);
    //     super.sendResponse(response);
    // }
    
    // sendRequest(command: string, args: any, timeout: number, cb: (response: DebugProtocol.Response) => void): void {
    //     super.sendRequest(command, args, timeout, cb);
    //     console.log(command, args);
    // }

    // sendEvent(event: DebugProtocol.Event): void {
    //     super.sendEvent(event);
    //     console.log(event);
    // }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request): void {
        const threads: DebugProtocol.Thread[] = [
            { id: this._runner.threadId, name: "Main Thread" },
        ];
        response.body = { threads: threads };
        this.sendResponse(response);
    }
    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('stackTrace', (stackFrameArgs: any) => {
            const main: da.StackFrame = { ...stackFrameArgs };
            response.body = { stackFrames: [main] };
            this.sendResponse(response);
        });
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request): void {
        const buildRef = this._varRefCounter++;
        const otherRef = this._varRefCounter++;
        const divertsRef = this._varRefCounter++;
        this._divertsRef = divertsRef;
        const buildin = new da.Scope("buildin", buildRef, true);
        const other = new da.Scope("other", otherRef, true);
        const diverts = new da.Scope("diverts", divertsRef, true);
        // store placeholders so runtime can populate them
        this._variablesStore.set(buildRef, []);
        this._variablesStore.set(otherRef, []);
        this._variablesStore.set(divertsRef, []);
        response.body = { scopes: [buildin, other, diverts] };
        // Ask runtime to populate variables for these scopes; runtime will set its own variables map
        this._runner.emit('scopes', response.body.scopes, () => {
            this.sendResponse(response);
        });
    }
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('variables', args.variablesReference, (variables: any) => {
            // Ensure variables are mapped to DebugProtocol.Variable[]
            const mapped = (variables || []).map((v: any) => {
                const vr = (v && v.variablesReference) ? v.variablesReference : 0;
                return { name: v.name || '<unknown>', value: String(v.value ?? ''), variablesReference: vr } as DebugProtocol.Variable;
            });
            response.body = { variables: mapped };
            this.sendResponse(response);
        });
    }
}