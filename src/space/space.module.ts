import { Module } from "@nestjs/common";
import { SpaceController } from "./space.controller";
import { SpaceService } from "./space.service";
import { SpaceSocketService } from "./space-socket.service";
import { SpaceGateway } from "./space.gateway";

@Module({
    controllers: [SpaceController],
    providers: [SpaceService, SpaceSocketService, SpaceGateway],
})
export class SpaceModule {}
