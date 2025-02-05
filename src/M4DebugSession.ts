import * as da from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { M4Runtime } from './M4Runtime';
export default class M4DebugSession extends da.DebugSession {
    private _runner: M4Runtime;
    constructor() {
        super();
        this._runner = new M4Runtime();
    }
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.sendEvent(
            new da.InitializedEvent()
        );
        response.body = {
            ...args
            // supportsConfigurationDoneRequest: true,
            // supportsSetVariable: true,
            // supportsHitConditionalBreakpoints: true,
            // supportsBreakpointLocationsRequest: true,
            // supportsFunctionBreakpoints: true,
            // supportsConditionalBreakpoints: true,
            // supportsInstructionBreakpoints: true,
            // supportsDataBreakpoints: true,
            // supportTerminateDebuggee: true
            // 其他支持的功能...
        };

        this.sendResponse(response);
    }
    BindEvent() {
        this._runner.on('Stopped', (...args) => {
            this.sendEvent(new da.StoppedEvent("breakpoint", this._runner.threadId));
        });
        this._runner.on('Output', ({ output, category, data }: { output: string, category?: string, data?: any }) => {
            this.sendEvent(new da.OutputEvent(output, category, data));
        });
        this._runner.on('Terminated', () => {
            this.sendEvent(new da.TerminatedEvent());
        });
    }
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: any, request?: DebugProtocol.Request): void {
        this.BindEvent();
        this._runner.debug(args);
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
        this._runner.emit('evaluate', args.expression,()=>{
            this.sendResponse(response);
        });
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('next',()=>{
            this.sendResponse(response);
        });
    }
    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('next',()=>{
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
                breakpoints: args.breakpoints.map((v) => {
                    return { source: args.source, ...v, verified: false };
                })
            };
            this._runner.breakPoints = response.body.breakpoints;
            this.sendResponse(response);
        }
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
        const buildin = new da.Scope("buildin", 1, true);
        const other = new da.Scope("other", 2, true);
        response.body = { scopes: [buildin, other] };
        this._runner.emit('scopes', response.body.scopes, () => {
            this.sendResponse(response);
        });
    }
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): void {
        this._runner.emit('variables', args.variablesReference, (variables: any) => {
            response.body = { variables: variables };
            this.sendResponse(response);
        });
    }
}