import { Injectable, ForbiddenException } from "@nestjs/common";
import { prisma } from "src/lib/prisma";

type Lock = {
    userId: string;
    timestamp: number;
};

@Injectable()
export class SpaceSocketService {
    private lineLocks = new Map<
        string, // spaceId
        Map<string, Lock> // lineId -> lock
    >();

    private LOCK_TIMEOUT = 10000;

    // LOAD SPACE WITH ORDERED CONTENT
    async loadSpace(spaceId: string, userId: string) {
        await this.assertCanAccess(spaceId, userId);

        return prisma.spaces.findUnique({
            where: { id: spaceId },
            include: {
                journal_entries: {
                    orderBy: { order: "asc" },
                },
            },
        });
    }

    // PERMISSION CHECK
    private async assertCanAccess(spaceId: string, userId: string) {
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
    }

    // LOCK LINE
    lockLine(spaceId: string, lineId: string, userId: string): boolean {
        if (!this.lineLocks.has(spaceId)) {
            this.lineLocks.set(spaceId, new Map());
        }

        const locks = this.lineLocks.get(spaceId);
        const existing = locks?.get(lineId);

        if (existing) {
            const expired = Date.now() - existing.timestamp > this.LOCK_TIMEOUT;

            if (!expired && existing.userId !== userId) {
                return false;
            }
        }

        locks?.set(lineId, {
            userId,
            timestamp: Date.now(),
        });

        return true;
    }

    // UNLOCK LINE
    unlockLine(spaceId: string, lineId: string, userId: string) {
        const locks = this.lineLocks.get(spaceId);
        if (!locks) return;

        const lock = locks.get(lineId);

        if (lock?.userId === userId) {
            locks.delete(lineId);
        }
    }

    // UPDATE LINE
    async updateLine(spaceId: string, lineId: string, text: string, userId: string) {
        await this.assertCanAccess(spaceId, userId);

        const locks = this.lineLocks.get(spaceId);
        const lock = locks?.get(lineId);

        if (lock && lock.userId !== userId) {
            return false;
        }

        await prisma.journal_entries.update({
            where: { id: lineId },
            data: {
                content: text,
                updated_at: new Date(),
            },
        });

        return true;
    }

    // CREATE LINE (with ordering)
    async createLine(spaceId: string, userId: string, afterOrder?: number) {
        await this.assertCanAccess(spaceId, userId);

        let newOrder = 1000;

        if (afterOrder !== undefined) {
            const next = await prisma.journal_entries.findFirst({
                where: {
                    space_id: spaceId,
                    order: { gt: afterOrder },
                },
                orderBy: { order: "asc" },
            });

            if (next) {
                newOrder = Math.floor((afterOrder + next.order) / 2);
            } else {
                newOrder = afterOrder + 1000;
            }
        }

        return prisma.journal_entries.create({
            data: {
                space_id: spaceId,
                user_id: userId,
                content: "",
                order: newOrder,
            },
        });
    }

    // DELETE LINE
    async deleteLine(spaceId: string, lineId: string, userId: string) {
        await this.assertCanAccess(spaceId, userId);

        await prisma.journal_entries.delete({
            where: { id: lineId },
        });
    }

    // SPLIT LINE (Enter key)
    async splitLine(spaceId: string, lineId: string, textBefore: string, textAfter: string, userId: string) {
        await this.assertCanAccess(spaceId, userId);

        const current = await prisma.journal_entries.findUnique({
            where: { id: lineId },
        });

        if (!current) return;

        // update current line
        await prisma.journal_entries.update({
            where: { id: lineId },
            data: { content: textBefore },
        });

        // create new line after
        const newLine = await this.createLine(spaceId, userId, current.order);

        await prisma.journal_entries.update({
            where: { id: newLine.id },
            data: { content: textAfter },
        });

        return newLine;
    }

    // MERGE LINE (Backspace)
    async mergeLine(spaceId: string, currentLineId: string, prevLineId: string, userId: string) {
        await this.assertCanAccess(spaceId, userId);

        const current = await prisma.journal_entries.findUnique({
            where: { id: currentLineId },
        });

        const prev = await prisma.journal_entries.findUnique({
            where: { id: prevLineId },
        });

        if (!current || !prev) return;

        // merge content
        await prisma.journal_entries.update({
            where: { id: prevLineId },
            data: {
                content: (prev.content || "") + (current.content || ""),
            },
        });

        // delete current line
        await prisma.journal_entries.delete({
            where: { id: currentLineId },
        });
    }

    // CLEANUP LOCKS (on disconnect)
    releaseUserLocks(userId: string) {
        this.lineLocks.forEach((locks) => {
            locks.forEach((lock, lineId) => {
                if (lock.userId === userId) {
                    locks.delete(lineId);
                }
            });
        });
    }
}
