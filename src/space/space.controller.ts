import { SpaceService } from "./space.service";
import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { SpaceSocketService } from "./space-socket.service";

@Controller("space")
export class SpaceController {
    constructor(
        private spaceService: SpaceService,
        private spaceSocketService: SpaceSocketService,
    ) {}

    @UseGuards(SupabaseAuthGuard)
    @Post()
    createSpace(@Req() req: any, @Body() body: { name: string }) {
        return this.spaceService.createSpace(req.user.id, body.name);
    }

    @UseGuards(SupabaseAuthGuard)
    @Get("/get")
    getSpaces(@Req() req: any) {
        return this.spaceService.getSpaces(req.user.id);
    }

    @UseGuards(SupabaseAuthGuard)
    @Post("/join/:inviteCode")
    joinSpace(@Req() req: any, @Param("inviteCode") inviteCode: string) {
        return this.spaceService.joinSpace(req.user.id, inviteCode);
    }

    @UseGuards(SupabaseAuthGuard)
    @Get(":spaceId")
    getSpaceDetails(@Param("spaceId") spaceId: string, @Req() req) {
        return this.spaceService.getSpaceContent(spaceId, req.user.id);
    }

    @UseGuards(SupabaseAuthGuard)
    @Post(":spaceId/create-line")
    createLine(@Param("spaceId") spaceId: string, @Body() body: { afterLineId?: string }, @Req() req) {
        return this.spaceService.createLine(spaceId, req.user.id, body.afterLineId);
    }
}
