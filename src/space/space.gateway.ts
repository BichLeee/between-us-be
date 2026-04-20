import { SubscribeMessage, WebSocketGateway, WebSocketServer, MessageBody, ConnectedSocket } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { SpaceSocketService } from "./space-socket.service";

@WebSocketGateway({ cors: true })
export class SpaceGateway {
    @WebSocketServer()
    server: Server;

    constructor(private spacesService: SpaceSocketService) {}

    // ===== JOIN =====
    @SubscribeMessage("join_space")
    handleJoin(@MessageBody() { spaceId }, @ConnectedSocket() client: Socket) {
        client.join(`space:${spaceId}`);
    }

    // ===== LOCK =====
    @SubscribeMessage("lock_line")
    handleLock(@MessageBody() { spaceId, lineId, userId }, @ConnectedSocket() client: Socket) {
        const ok = this.spacesService.lockLine(spaceId, lineId, userId);

        if (!ok) {
            client.emit("lock_failed", { lineId });
            return;
        }

        client.to(`space:${spaceId}`).emit("line_locked", {
            lineId,
            userId,
        });
    }

    // ===== UNLOCK =====
    @SubscribeMessage("unlock_line")
    handleUnlock(@MessageBody() { spaceId, lineId, userId }) {
        this.spacesService.unlockLine(spaceId, lineId, userId);

        this.server.to(`space:${spaceId}`).emit("line_unlocked", {
            lineId,
        });
    }

    // ===== UPDATE =====
    @SubscribeMessage("update_line")
    async handleUpdate(@MessageBody() { spaceId, lineId, text, userId }, @ConnectedSocket() client: Socket) {
        const ok = await this.spacesService.updateLine(spaceId, lineId, text, userId);

        if (!ok) {
            client.emit("update_rejected", { lineId });
            return;
        }

        client.to(`space:${spaceId}`).emit("line_updated", {
            lineId,
            text,
            userId,
        });
    }

    @SubscribeMessage("create_line")
    async handleCreateLine(
        @ConnectedSocket() client: Socket,
        @MessageBody()
        payload: {
            spaceId: string;
            afterOrder?: number;
            userId: string;
        },
    ) {
        const { spaceId, afterOrder, userId } = payload;

        // 🔐 (optional) you should extract userId from auth instead
        // const userId = client.data.user.id;

        const newLine = await this.spacesService.createLine(spaceId, userId, afterOrder);

        // 📡 broadcast to everyone in the space
        this.server.to(`space:${spaceId}`).emit("line_created", newLine);

        return newLine;
    }

    // ===== DISCONNECT =====
    handleDisconnect(client: Socket) {
        const userId = client.handshake.query.userId as string;
        this.spacesService.releaseUserLocks(userId);
    }
}
