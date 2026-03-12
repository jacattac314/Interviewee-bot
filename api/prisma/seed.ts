/**
 * Development seed script.
 *
 * Run with:  npx ts-node prisma/seed.ts
 * or via:   npm run db:seed
 *
 * All operations are idempotent — safe to run multiple times.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function main(): Promise<void> {
  // ── JobRequisition ─────────────────────────────────────────────────────────
  const existingReq = await prisma.jobRequisition.findFirst({
    where: { title: 'AI Operations Analyst', isActive: true },
  });
  if (!existingReq) {
    const req = await prisma.jobRequisition.create({
      data: {
        title: 'AI Operations Analyst',
        isActive: true,
      },
    });
    console.log('Created JobRequisition:', req.id);
  } else {
    console.log('JobRequisition already exists:', existingReq.id);
  }

  // ── Reviewer ───────────────────────────────────────────────────────────────
  const reviewer = await prisma.reviewer.upsert({
    where: { email: 'hiring@fairly.com' },
    update: { name: 'Sam Hiring', role: 'HIRING_MANAGER' },
    create: {
      name: 'Sam Hiring',
      email: 'hiring@fairly.com',
      role: 'HIRING_MANAGER',
    },
  });
  console.log('Upserted Reviewer:', reviewer.id);

  // ── IntegrationConnection ─────────────────────────────────────────────────
  const existingIntegration = await prisma.integrationConnection.findFirst({
    where: { system: 'greenhouse' },
  });
  if (!existingIntegration) {
    const integration = await prisma.integrationConnection.create({
      data: {
        system: 'greenhouse',
        credentialsRef: { ref: 'env' },
      },
    });
    console.log('Created IntegrationConnection:', integration.id);
  } else {
    console.log('IntegrationConnection already exists:', existingIntegration.id);
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
