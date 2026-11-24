import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';

const require = createRequire('/app/apps/api/package.json');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const credentials = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const companyName = 'GoPark Review — тестовая организация';
const managerEmail = 'review.manager@gopark.invalid';
const driverEmail = 'review.driver@gopark.invalid';

function hash(password) {
  if (typeof password !== 'string' || password.length < 18) throw new Error('A strong review password is required');
  const salt = randomBytes(16).toString('hex');
  return `scrypt$16384$8$1$${salt}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
}

try {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findMany({ where: { email: { in: [managerEmail, driverEmail] } }, select: { email: true, role: true, companyName: true } });
    if (existing.length) {
      if (existing.length !== 2 || existing.some((user) => user.companyName !== companyName || user.role !== (user.email === managerEmail ? 'manager' : 'driver'))) {
        throw new Error('Existing account collision; no accounts were changed');
      }
      console.log('Both isolated review accounts already exist; credentials were not changed');
      return;
    }
    const manager = await tx.user.create({ data: {
      email: managerEmail, firstName: 'Демо', lastName: 'Бригадир',
      role: 'manager', status: 'active', companyName,
      passwordHash: hash(credentials.managerPassword), mustChangePassword: false,
      manager: { create: { title: 'Тестовый бригадир', level: 'regular' } },
    }, include: { manager: true } });
    const driver = await tx.user.create({ data: {
      email: driverEmail, firstName: 'Демо', lastName: 'Водитель',
      role: 'driver', status: 'active', companyName,
      passwordHash: hash(credentials.driverPassword), mustChangePassword: false,
      driver: { create: {
        firstName: 'Демо', lastName: 'Водитель', phone: '+996000000002',
        companyName, managerId: manager.manager.id, status: 'active',
      } },
    }, include: { driver: true } });
    await tx.chatThread.create({ data: {
      driverId: driver.driver.id, managerId: manager.manager.id,
      subject: 'Тестовый чат GoPark',
      messages: { create: {
        senderUserId: manager.id, senderRole: 'manager', senderName: 'Демо Бригадир',
        body: 'Добро пожаловать в тестовую организацию GoPark. Здесь можно проверить рабочие сообщения. Данные вымышленные.',
      } },
    } });
    console.log('Created isolated driver and manager review accounts with a sample chat; no financial records or existing accounts were changed');
  });
} finally {
  await prisma.$disconnect();
}
