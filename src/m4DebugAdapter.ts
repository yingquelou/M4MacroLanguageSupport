import * as Net from 'net';
import M4DebugSession from './M4DebugSession';
const net = Net.createServer((sockect) => {
    const session = new M4DebugSession();
    session.setRunAsServer(true);
    session.start(sockect, sockect)
}).listen(0).address() as Net.AddressInfo
export const port = net.port