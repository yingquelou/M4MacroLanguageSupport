import * as Net from 'net';
import M4DebugSession from './M4DebugSession';

const server = Net.createServer((socket) => {
    const session = new M4DebugSession();
    session.setRunAsServer(true);
    session.start(socket, socket);
});

// listen on loopback only for security and predictability
let _port = 0;
server.listen(0, '127.0.0.1', () => {
    const address = server.address() as Net.AddressInfo | null;
    _port = address?.port ?? 0;
});

export function getPort(): number {
    return _port;
}

export const serverInstance = server;

export function closeServer(): void {
    try {
        server.close();
    } catch (e) { }
}