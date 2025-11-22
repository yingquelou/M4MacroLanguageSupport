import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import path = require('path');
import { m4fparserFromPath } from './m4fparser';
import { tmpdir } from 'os';
export class M4Runtime extends EventEmitter {

    private _process: ChildProcess | undefined;
    private _breakPoints: any[] = [];
    private _lineCt: number = 0;
    private _lines: string[] = [];
    private variables: Map<number, any> = new Map<number, any>();
    // divert stream buffers: key -> concatenated content
    private _diverts: Map<number, string> = new Map<number, string>();
    // buffer recent stderr lines to help associate stdout output with divert markers
    private _stderrBuffer: string[] = [];
    // call depth tracking for stepOut behavior
    private _callDepth: number = 0;
    private _stepOutTargetDepth: number | null = null;
    private _evaluateQueue: Array<{ buffer: string, cb: (result?: string) => void, timer?: NodeJS.Timeout }> = [];

    private _instanceId: number;
    private static _instanceCounter: number = 1;

    constructor() {
        super();
        this._instanceId = M4Runtime._instanceCounter++;
    }

    debug(config: any) {
        // this._lineCt = 0;
        var { cwd, m4, includes, program } = config;
        if (program === undefined) {
            this.emit('Output', { output: "program undfined in launch.json", category: 'stderr' });
            this.emit('Terminated');
        }
        if (m4 === undefined) {
            m4 = 'm4';
        }
        if (includes === undefined) {
            includes = [];
        }
        if (!path.isAbsolute(program)) {
            program = path.join(cwd, program);
        }
        const stream = createReadStream(program, { autoClose: true, encoding: 'utf-8' });
        stream.on('error', (err) => {
            this.emit('Output', { output: err.message, category: 'stderr' });
            this.emit('Terminated');
        });
        stream.on('data', (chuck) => {
            const m4includes = includes.map((v: any) => {
                return `-I${v}`;
            });
            this._process = spawn(m4, ['-i', '-dV', ...m4includes], { cwd: `${cwd}`, detached: false });
            this._process.on('error', (err) => {
                this.emit('Output', {
                    output: 'The following errors may exist:\n\
1. in launch.json,the field "cwd": No path specified, the specified path does not exist or is incorrect\n\
2. The M4 executable path is not added to the operating system environment or is not specified directly in the launch.json file (field is m4)',
                    category: 'stderr'
                });
                this.emit('Terminated');
            });
            const { stdin, stdout, stderr } = this._process;
            if (stdout) {
                stdout.on('data', (data) => {
                    const text = data.toString();
                    this.emit('Output', { output: text, category: 'stdout' });
                    // detect divert-style markers in output and capture them
                    // support patterns like: "divert 1: text" or "DIVERT[1]: text"
                    const lines = text.split(/\r?\n/);
                    for (const line of lines) {
                        if (!line) { continue; }
                        const m1 = line.match(/(?:divert\s+(\d+)\s*:|DIVERT\[(\d+)\]\s*:)/i);
                        if (m1) {
                            const idx = Number(m1[1] || m1[2]);
                            const rest = line.substring(m1[0].length).trim();
                            const prev = this._diverts.get(idx) || '';
                            let next = prev + (rest ? (prev ? '\n' : '') + rest : '');
                            // truncate divert content to prevent unbounded memory growth
                            const MAX_DIVERT = 100 * 1024; // 100KB
                            if (next.length > MAX_DIVERT) {
                                next = next.substring(next.length - MAX_DIVERT);
                            }
                            this._diverts.set(idx, next);
                            this.emit('divertUpdated', { stream: idx, content: next });
                            continue;
                        }
                        // also support a separate marker line like "-- divert 1 start" until "-- divert 1 end"
                        const m2 = line.match(/--\s*divert\s*(\d+)\s*start/i);
                        if (m2) {
                            const idx = Number(m2[1]);
                            // collect subsequent lines until end marker — naive: append this line marker removed
                            // For simplicity, append an empty marker and emit update
                            const prev = this._diverts.get(idx) || '';
                            this._diverts.set(idx, prev);
                            this.emit('divertUpdated', { stream: idx, content: prev });
                            continue;
                        }
                        // If no explicit divert marker on stdout line, try to associate this line
                        // with the most recent stderr divert marker (useful when divert content
                        // is emitted only after macro expansion and marker appears on stderr).
                        try {
                            const recent = this._stderrBuffer.slice(-200).reverse();
                            let associatedIdx: number | null = null;
                            for (const seLine of recent) {
                                if (!seLine) { continue; }
                                const sm = seLine.match(/(?:divert\s+(\d+)|DIVERT\[(\d+)\])/i);
                                if (sm) {
                                    associatedIdx = Number(sm[1] || sm[2]);
                                    break;
                                }
                            }
                            if (associatedIdx !== null) {
                                const idx = associatedIdx;
                                const rest = line.trim();
                                const prev = this._diverts.get(idx) || '';
                                let next = prev + (rest ? (prev ? '\n' : '') + rest : '');
                                const MAX_DIVERT = 100 * 1024; // 100KB
                                if (next.length > MAX_DIVERT) {
                                    next = next.substring(next.length - MAX_DIVERT);
                                }
                                this._diverts.set(idx, next);
                                this.emit('divertUpdated', { stream: idx, content: next });
                                continue;
                            }
                        } catch (e) { }
                    }

                    // if there is a pending evaluate, append and resolve on newline
                    if (this._evaluateQueue.length > 0) {
                        const cur = this._evaluateQueue[0];
                        cur.buffer += text;
                        if (cur.buffer.indexOf('\n') !== -1) {
                            const idx = cur.buffer.indexOf('\n');
                            const res = cur.buffer.substring(0, idx);
                            if (cur.timer) { clearTimeout(cur.timer); }
                            try { cur.cb(res); } catch (e) { cur.cb(); }
                            this._evaluateQueue.shift();
                        }
                    }
                });
            }
            if (stderr) {
                stderr.on('data', (data) => {
                    const output: string = data.toString();
                    this.emit('Output', { output: output, category: 'stderr' });
                    // buffer stderr lines for cross-association with stdout
                    try {
                        const stext = output.toString();
                        const sLines = stext.split(/\r?\n/).filter(Boolean);
                        for (const l of sLines) {
                            this._stderrBuffer.push(l);
                        }
                        // limit buffer size
                        if (this._stderrBuffer.length > 500) {
                            this._stderrBuffer.splice(0, this._stderrBuffer.length - 500);
                        }
                    } catch (e) { }
                    // update call depth from m4trace-like markers if present
                    try {
                        const s = output;
                        // common markers: 'm4trace:enter', 'm4trace:exit' or words 'enter'/'exit'
                        if (/m4trace[:\s]*enter/i.test(s) || /\benter\b/i.test(s)) {
                            this._callDepth += 1;
                        }
                        if (/m4trace[:\s]*exit/i.test(s) || /\bexit\b/i.test(s)) {
                            this._callDepth = Math.max(0, this._callDepth - 1);
                        }
                    } catch (e) { }
                });
            }
            if (stdin) {
                const text = chuck as string;
                this._lines = text.split(/\r?\n/);
                    // validate any breakpoints set before runtime started
                    this.validateBreakpoints();
                const seqreg = /\\/g;
                const lhs = program.replace(seqreg, '/').toLowerCase();
                this.on('next', (res) => {
                    if (this._lineCt < this._lines.length) {
                        stdin.write(this._lines[this._lineCt] + '\n');
                        this._lineCt += 1;
                        this.emit('Stopped');
                    }
                    else {
                        stdin.end();
                        this.emit('Terminated');
                    }
                    res();
                });
                var keepbreak = -1;
                this.on('continue', () => {
                    if (this._lineCt < this._lines.length) {
                        if (this._breakPoints.some((v) => {
                            const rhs = v.source.path.replace(seqreg, '/').toLowerCase();
                            if (lhs === rhs) {
                                return (v.line - 1) === this._lineCt;
                            }
                        })) {
                            if (this._lineCt === keepbreak) {
                                stdin.write(this._lines[this._lineCt] + '\n');
                                this._lineCt += 1;
                                this.emit('continue');
                                // console.log('continue1:%d', this._lineCt);
                            } else {
                                keepbreak = this._lineCt;
                                this.emit('Stopped');
                            }
                        } else {
                            // console.log('continue2:%d', this._lineCt);
                            stdin.write(this._lines[this._lineCt] + '\n');
                            this._lineCt += 1;
                            this.emit('continue');
                        }
                    } else {
                        stdin.end();
                        this.emit('Terminated');
                    }
                });

                this.on('evaluate', (exp: string, res: (result?: string) => void) => {
                    if (!stdin) { res(); return; }
                    // push a new evaluate request and write to stdin
                    const entry = { buffer: '', cb: res, timer: undefined as any };
                    // safety timeout to resolve evaluate if no newline arrives
                    entry.timer = setTimeout(() => {
                        try { entry.cb(entry.buffer || undefined); } catch (e) { entry.cb(); }
                        const idx = this._evaluateQueue.indexOf(entry as any);
                        if (idx >= 0) { this._evaluateQueue.splice(idx, 1); }
                    }, 1000);
                    this._evaluateQueue.push(entry as any);
                    stdin.write(exp + '\n');
                });
                // stepIn behaves like next (advance a single logical step)
                this.on('stepIn', (res: () => void) => {
                    if (this._lineCt < this._lines.length) {
                        stdin.write(this._lines[this._lineCt] + '\n');
                        this._lineCt += 1;
                        this.emit('Stopped');
                    } else {
                        stdin.end();
                        this.emit('Terminated');
                    }
                    try { res(); } catch (e) { }
                });

                // stepOut: continue until call depth decreases (if we can track it), otherwise act as continue
                this.on('stepOut', (res: () => void) => {
                    if (this._callDepth <= 0) {
                        // no depth info — treat as continue
                        this.emit('continue');
                        try { res(); } catch (e) { }
                        return;
                    }
                    this._stepOutTargetDepth = Math.max(0, this._callDepth - 1);

                    const drive = () => {
                        if (this._lineCt < this._lines.length) {
                            stdin.write(this._lines[this._lineCt] + '\n');
                            this._lineCt += 1;
                            // if call depth has decreased sufficiently, stop
                            if (this._stepOutTargetDepth !== null && this._callDepth <= this._stepOutTargetDepth) {
                                this._stepOutTargetDepth = null;
                                this.emit('Stopped');
                                try { res(); } catch (e) { }
                                return;
                            }
                            // schedule next iteration to allow stderr to update call depth
                            setImmediate(drive);
                        } else {
                            stdin.end();
                            this.emit('Terminated');
                            try { res(); } catch (e) { }
                        }
                    };
                    setImmediate(drive);
                });
                this.on('stackTrace', (cb) => {
                    cb({
                        id: this.threadId,
                        name: 'main',
                        source: { path: program },
                        line: this._lineCt + ((this._lineCt === this._lines.length) ? 0 : 1),
                        column: 0
                    });
                });
                const td = path.join(tmpdir(), path.basename(program, path.extname(program)));
                if (!existsSync(td)) {
                    mkdirSync(td, { recursive: true });
                }
                var tdf = 0;
                this.on('scopes', (scopes, callback) => {
                    const buildin = scopes.find((v: any) => {
                        return v.name === 'buildin';
                    });
                    const other = scopes.find((v: any) => {
                        return v.name === 'other';
                    });
                    const tmpfile = path.join(td, `${tdf}.m4f`);

                    tdf += 1;
                    if (buildin && other) {
                        const scopesprocess = spawn(m4, ['-i', '-F', tmpfile.replace(/\\/g,'/'), ...m4includes], { cwd: cwd });
                        for (let i = 0; i < this._lineCt; i++) {
                            const line = this._lines[i];
                            scopesprocess.stdin.write(line + '\n');
                        }
                        scopesprocess.stdin.end();

                        scopesprocess.on('close', (code) => {
                            // console.log(code);
                            m4fparserFromPath(tmpfile, callback, (b: any, o: any) => {
                                this.variables.set(buildin.variablesReference, b);
                                this.variables.set(other.variablesReference, o);
                            });
                            // console.log('ok');
                        });
                    }
                });
                this.on('variables', (ref, callback) => {
                    callback(this.variables.get(ref));
                });
                this.on('getDiverts', (cb) => {
                    // return an array of { stream, content }
                    const arr: any[] = [];
                    this._diverts.forEach((v, k) => {
                        arr.push({ stream: k, content: v });
                    });
                    cb(arr);
                });
                // ensure process termination is reported
                this._process.on('exit', (code, signal) => {
                    this.emit('Output', { output: `Process exited with code ${code}${signal ? ' signal ' + signal : ''}\n`, category: 'stdout' });
                    this.emit('Terminated');
                });
                this._process.on('close', (code, signal) => {
                    this.emit('Terminated');
                });
                // ensure we can stop the child process when requested
                this.on('stopProcess', () => {
                    try {
                        if (this._process && !this._process.killed) {
                            this._process.kill();
                        }
                    } catch (e) { }
                });
                // expose stop helper
                // (also provide public stop method below)
                this.emit('continue');
            }
        });
    }
    public set breakPoints(v: any) {
        this._breakPoints = v || [];
        // if runtime already loaded lines, validate immediately
        this.validateBreakpoints();
    }

    private validateBreakpoints() {
        try {
            if (!this._lines || this._lines.length === 0 || !this._breakPoints) { return; }
            const seqreg = /\\/g;
            // we don't have program path here, but stackTrace provides it; derive from existing breakpoints
            const validated = this._breakPoints.map((bp) => {
                const rhs = (bp && bp.source && bp.source.path) ? bp.source.path.replace(seqreg, '/').toLowerCase() : '';
                // assume program path equals first breakpoint source if available
                // for this runtime we will mark verified true if the line exists in _lines
                const lineIndex = (bp && bp.line) ? (bp.line - 1) : -1;
                const verified = (lineIndex >= 0 && lineIndex < this._lines.length);
                return { verified: verified, line: bp.line, source: bp.source };
            });
            this.emit('breakpointsValidated', validated);
        } catch (err) {
            // ignore validation errors
        }
    }

    public get threadId(): number {
        return this._instanceId;
    }

    public stop(): void {
        try {
            if (this._process && !this._process.killed) {
                this._process.kill();
            }
        } catch (e) { }
    }
}
