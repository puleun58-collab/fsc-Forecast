import { QuarterStatus, type Prisma, type QuarterSetting } from '@prisma/client';

export async function activateQuarter(
  tx: Prisma.TransactionClient,
  quarterId: string,
): Promise<QuarterSetting> {
  await tx.quarterSetting.updateMany({
    where: {
      isActive: true,
      id: {
        not: quarterId,
      },
    },
    data: {
      isActive: false,
      activeKey: null,
      status: QuarterStatus.closed,
    },
  });

  return tx.quarterSetting.update({
    where: {
      id: quarterId,
    },
    data: {
      isActive: true,
      activeKey: 'ACTIVE',
      status: QuarterStatus.active,
    },
  });
}
