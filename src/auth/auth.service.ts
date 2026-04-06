import { Injectable, UnauthorizedException } from "@nestjs/common";
import { prisma } from "src/lib/prisma";

@Injectable()
export class AuthService {
    /**
     * Lấy current user từ DB (public.users)
     */
    async getCurrentUser(id: string) {
        const user = await prisma.users.findUnique({
            where: { id },
        });

        if (!user) {
            throw new UnauthorizedException("User not found");
        }

        return user;
    }

    /**
     * (Optional) update profile
     */
    updateProfile(
        userId: string,
        data: {
            name?: string;
            username?: string;
        },
    ) {
        return prisma.users.update({
            where: { id: userId },
            data,
        });
    }
}
