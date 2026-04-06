import { Controller, Get, Patch, Body, UseGuards, Req } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SupabaseAuthGuard } from "./supabase-auth.guard";

@Controller("auth")
export class AuthController {
    constructor(private authService: AuthService) {}

    @UseGuards(SupabaseAuthGuard)
    @Get("me")
    getMe(@Req() req) {
        console.log(req);
        return this.authService.getCurrentUser(req.user.id);
    }

    @UseGuards(SupabaseAuthGuard)
    @Patch("me")
    updateMe(@Req() req, @Body() body) {
        return this.authService.updateProfile(req.user.id, body);
    }
}
