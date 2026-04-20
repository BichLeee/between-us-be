import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "src/lib/prisma";

@Injectable()
export class SpaceService {
    private spaceCache = new Map<string, any[]>();

    createSpace(userId: string, name: string) {
        return prisma.spaces.create({
            data: {
                name,
                space_members: {
                    create: {
                        user_id: userId,
                        role: "owner",
                    },
                },
            },
        });
    }
    async getSpaces(userId: string) {
        const spaces = await prisma.spaces.findMany({
            where: {
                space_members: {
                    some: {
                        user_id: userId,
                    },
                },
            },
            include: {
                space_members: {
                    where: {
                        user_id: userId,
                    },
                    select: {
                        role: true,
                    },
                },
            },
            orderBy: {
                created_at: "desc",
            },
        });

        return spaces.map((space) => ({
            id: space.id,
            name: space.name,
            role: space.space_members[0]?.role,
        }));
    }
    async joinSpace(userId: string, inviteCode: string) {
        // 1. find space
        const space = await prisma.spaces.findFirst({
            where: {
                invite_code: inviteCode,
            },
        });

        if (!space) {
            throw new NotFoundException("Invalid invite code");
        }

        // 2. check already joined
        const existing = await prisma.space_members.findUnique({
            where: {
                user_id_space_id: {
                    space_id: space.id,
                    user_id: userId,
                },
            },
        });

        if (existing) {
            return { message: "Already joined", spaceId: space.id };
        }

        // 3. add member
        await prisma.space_members.create({
            data: {
                space_id: space.id,
                user_id: userId,
                role: "member",
            },
        });

        return {
            message: "Joined successfully",
            spaceId: space.id,
        };
    }
    async getSpaceContent(spaceId: string, userId: string) {
        // check permission
        const member = await prisma.space_members.findUnique({
            where: {
                user_id_space_id: {
                    user_id: userId,
                    space_id: spaceId,
                },
            },
        });

        if (!member) {
            throw new ForbiddenException("No access to this space");
        }

        // get space + ordered lines
        const space = await prisma.spaces.findUnique({
            where: { id: spaceId },
            include: {
                journal_entries: {
                    orderBy: {
                        order: "asc",
                    },
                    select: {
                        id: true,
                        content: true,
                        order: true,
                        user_id: true,
                        created_at: true,
                    },
                },
            },
        });

        if (!space) {
            throw new NotFoundException("Space not found");
        }

        return {
            id: space.id,
            name: space.name,
            entries: space.journal_entries,
        };
    }
    async createLine(spaceId: string, userId: string, afterLineId?: string) {
        // permission check
        const member = await prisma.space_members.findUnique({
            where: {
                user_id_space_id: {
                    user_id: userId,
                    space_id: spaceId,
                },
            },
        });

        if (!member) {
            throw new ForbiddenException("No access");
        }

        let newOrder = 1000;

        // =========================================
        // CASE 1: insert after a specific line
        // =========================================
        if (afterLineId) {
            const current = await prisma.journal_entries.findUnique({
                where: { id: afterLineId },
            });

            if (!current) {
                throw new NotFoundException("Line not found");
            }

            const next = await prisma.journal_entries.findFirst({
                where: {
                    space_id: spaceId,
                    order: { gt: current.order },
                },
                orderBy: { order: "asc" },
            });

            if (next) {
                // 🔥 insert between
                newOrder = Math.floor((current.order + next.order) / 2);
            } else {
                // 🔥 append after last
                newOrder = current.order + 1000;
            }
        }

        // =========================================
        // CASE 2: no afterLineId → append to end
        // =========================================
        else {
            const last = await prisma.journal_entries.findFirst({
                where: { space_id: spaceId },
                orderBy: { order: "desc" },
            });

            if (last) {
                newOrder = last.order + 1000;
            }
        }

        // =========================================
        // CREATE LINE
        // =========================================
        return prisma.journal_entries.create({
            data: {
                space_id: spaceId,
                user_id: userId,
                content: "",
                order: newOrder,
            },
        });
    }
}
