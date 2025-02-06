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
            this._process = spawn(m4, ['-i', '-dV', ...m4includes], { cwd: `${cwd}`, detached: true });
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
                    this.emit('Output', { output: data.toString(), category: 'stdout' });
                });
            }
            if (stderr) {
                const pat = /^m4trace:(\w+):(\d+):/;

                stderr.on('data', (data) => {
                    const output: string = data.toString();
                    this.emit('Output', { output: output, category: 'console' });
                });
            }
            if (stdin) {
                const text = chuck as string;
                this._lines = text.split(/\r?\n/);
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

                this.on('evaluate', (exp, res) => {
                    stdin.write(exp + '\n');
                    res();
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
                this.emit('continue');
            }
        });
    }
    public set breakPoints(v: any) {
        this._breakPoints = v;
    }

    public get threadId(): number {
        return process.pid;
    }
}
