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
        const members: any[] = await prisma.$queryRaw`
            SELECT
                sm.*,
                u.*
            FROM space_members sm
            JOIN users u
                ON sm.user_id = u.id
            WHERE sm.space_id = ${spaceId};
        `;

        if (!members.find((m) => m.user_id === userId)) {
            throw new ForbiddenException("No access to this space");
        }

        // get space + ordered lines
        const space = await prisma.spaces.findUnique({
            where: { id: spaceId },
            include: {
                journal_entries: {
                    orderBy: {
                        entry_order: "asc",
                    },
                    select: {
                        id: true,
                        content: true,
                        entry_order: true,
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
            ...space,
            id: space.id,
            name: space.name,
            entries: space.journal_entries,
            members: members,
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

        // insert after a specific line
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
                    entry_order: { gt: current.entry_order },
                },
                orderBy: { entry_order: "asc" },
            });

            if (next) {
                // insert between
                newOrder = Math.floor((current.entry_order + next.entry_order) / 2);
            } else {
                // append after last
                newOrder = current.entry_order + 1000;
            }
        }

        // no afterLineId, append to end
        else {
            const last = await prisma.journal_entries.findFirst({
                where: { space_id: spaceId },
                orderBy: { entry_order: "desc" },
            });

            if (last) {
                newOrder = last.entry_order + 1000;
            }
        }

        // CREATE LINE
        return prisma.journal_entries.create({
            data: {
                space_id: spaceId,
                user_id: userId,
                content: "",
                entry_order: newOrder,
            },
        });
    }
    async deleteLine(lineId: string) {
        await prisma.journal_entries.delete({
            where: { id: lineId },
        });
    }

    async leaveSpace(spaceId: string, userId: string) {
        // members
        const members = await prisma.space_members.findMany({
            where: {
                space_id: spaceId,
                user_id: { not: userId },
            },
        });

        //is owner
        if (members.find((m) => m.role === "owner")?.user_id === userId) {
            if (members.length > 1) {
                // transfer ownership to another member and remove the current owner
                await prisma.space_members.update({
                    where: {
                        user_id_space_id: {
                            space_id: spaceId,
                            user_id: members[0].user_id,
                        },
                    },
                    data: {
                        role: "owner",
                    },
                });
                // delete the current owner
                await prisma.space_members.delete({
                    where: {
                        user_id_space_id: {
                            space_id: spaceId,
                            user_id: userId,
                        },
                    },
                });
            } else {
                // delete the space and all its content
                await prisma.journal_entries.deleteMany({
                    where: {
                        space_id: spaceId,
                    },
                });
                await prisma.spaces.delete({
                    where: {
                        id: spaceId,
                    },
                });
            }
        } else {
            // delete the member
            await prisma.space_members.delete({
                where: {
                    user_id_space_id: {
                        space_id: spaceId,
                        user_id: userId,
                    },
                },
            });
        }
    }
}
