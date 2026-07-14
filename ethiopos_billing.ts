// ============================================================
// EthioPOS — SaaS Billing & Subscription Management
// Handles: Plans · Trials · Billing cycles · Dunning · Invoices
// ============================================================

// ─── src/billing/billing.module.ts ───────────────────────────
import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingController }    from './billing.controller';
import { BillingService }       from './billing.service';
import { DunningService }       from './dunning.service';
import { BillingInvoiceService }from './invoice.service';
import { Subscription }   from './subscription.entity';
import { BillingInvoice } from './billing-invoice.entity';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, BillingInvoice]),
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [BillingController],
  providers:   [BillingService, DunningService, BillingInvoiceService],
  exports:     [BillingService],
})
export class BillingModule {}

// ─── src/billing/plans.config.ts ─────────────────────────────
export interface PlanConfig {
  id:            string;
  name:          string;
  nameAm:        string;           // Amharic name
  monthlyPrice:  number;           // ETB
  annualPrice:   number;           // ETB/month billed annually
  trialDays:     number;
  maxBranches:   number;           // -1 = unlimited
  maxUsers:      number;           // -1 = unlimited
  maxSKUs:       number;           // -1 = unlimited
  features:      string[];
  aiQueries:     number;           // per month, -1 = unlimited
  apiAccess:     boolean;
  prioritySupport: boolean;
}

export const PLANS: Record<string, PlanConfig> = {
  starter: {
    id:           'starter',
    name:         'Starter',
    nameAm:       'ጀማሪ',
    monthlyPrice: 299,
    annualPrice:  249,
    trialDays:    14,
    maxBranches:  1,
    maxUsers:     2,
    maxSKUs:      50,
    aiQueries:    20,
    apiAccess:    false,
    prioritySupport: false,
    features: [
      'Point of Sale',
      'Basic Inventory (50 SKUs)',
      'Sales Reports',
      'Cash & Telebirr Payments',
      'VAT Receipts',
      'Email Support',
    ],
  },
  professional: {
    id:           'professional',
    name:         'Professional',
    nameAm:       'ፕሮፌሽናል',
    monthlyPrice: 799,
    annualPrice:  649,
    trialDays:    14,
    maxBranches:  5,
    maxUsers:     10,
    maxSKUs:      -1,
    aiQueries:    200,
    apiAccess:    false,
    prioritySupport: false,
    features: [
      'Everything in Starter',
      '5 Branches',
      'Unlimited Inventory',
      'AI Business Intelligence',
      'CRM & Loyalty Program',
      'HR & Payroll',
      'Accounting Module',
      'Invoice & Quotation Management',
      'Warehouse Management',
      'All Payment Methods',
      'Priority Email Support',
    ],
  },
  enterprise: {
    id:           'enterprise',
    name:         'Enterprise',
    nameAm:       'ኢንተርፕራይዝ',
    monthlyPrice: 1999,
    annualPrice:  1599,
    trialDays:    14,
    maxBranches:  -1,
    maxUsers:     -1,
    maxSKUs:      -1,
    aiQueries:    -1,
    apiAccess:    true,
    prioritySupport: true,
    features: [
      'Everything in Professional',
      'Unlimited Branches & Users',
      'Custom AI Model Training',
      'Full API Access',
      'Dedicated Account Manager',
      'SLA: 99.9% Uptime',
      'On-site Training (Addis Ababa)',
      'Custom Integrations',
      'ERCA Direct Filing',
    ],
  },
};

// ─── src/billing/subscription.entity.ts ──────────────────────
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() tenant_id:   string;
  @Column() plan_id:     string;         // starter | professional | enterprise
  @Column() billing:     string;         // monthly | annual
  @Column({ default: 'trial' })
  status: string; // trial | active | past_due | suspended | cancelled

  @Column({ type: 'timestamptz', nullable: true }) trial_ends_at:  Date;
  @Column({ type: 'timestamptz', nullable: true }) current_period_start: Date;
  @Column({ type: 'timestamptz', nullable: true }) current_period_end:   Date;
  @Column({ type: 'timestamptz', nullable: true }) cancelled_at:   Date;

  @Column({ default: 0 })  failed_payment_attempts: number;
  @Column({ nullable: true }) last_payment_ref:      string;
  @Column({ nullable: true }) payment_method:        string; // telebirr | cbe_birr | bank

  // Usage tracking
  @Column({ default: 0 }) branches_used: number;
  @Column({ default: 0 }) users_used:    number;
  @Column({ default: 0 }) skus_used:     number;

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}

// ─── src/billing/billing.service.ts ──────────────────────────
import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Subscription }         from './subscription.entity';
import { BillingInvoice }       from './billing-invoice.entity';
import { PLANS }                from './plans.config';
import { PaymentsService }      from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingInvoiceService }from './invoice.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Subscription)   private subRepo: Repository<Subscription>,
    @InjectRepository(BillingInvoice) private invRepo: Repository<BillingInvoice>,
    private payments:      PaymentsService,
    private notifications: NotificationsService,
    private invoiceSvc:    BillingInvoiceService,
  ) {}

  // Start free trial when new tenant signs up
  async startTrial(tenantId: string, planId: string = 'professional'): Promise<Subscription> {
    const plan = PLANS[planId];
    if (!plan) throw new BadRequestException(`Invalid plan: ${planId}`);

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + plan.trialDays);

    const sub = this.subRepo.create({
      tenant_id:      tenantId,
      plan_id:        planId,
      billing:        'monthly',
      status:         'trial',
      trial_ends_at:  trialEnd,
    });

    await this.subRepo.save(sub);
    this.logger.log(`Trial started for tenant ${tenantId} — plan: ${planId}, ends: ${trialEnd.toISOString()}`);

    await this.notifications.create(tenantId, null,
      '🎉 Welcome to EthioPOS!',
      `Your 14-day free trial has started. Add your products and process your first sale today!`,
      '#10B981',
    );

    return sub;
  }

  // Activate paid subscription
  async activateSubscription(tenantId: string, planId: string, billing: 'monthly' | 'annual', paymentRef: string): Promise<Subscription> {
    const plan = PLANS[planId];
    if (!plan) throw new BadRequestException(`Invalid plan: ${planId}`);

    let sub = await this.subRepo.findOne({ where: { tenant_id: tenantId } });
    if (!sub) sub = this.subRepo.create({ tenant_id: tenantId });

    const now = new Date();
    const periodEnd = new Date(now);
    if (billing === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    sub.plan_id              = planId;
    sub.billing              = billing;
    sub.status               = 'active';
    sub.current_period_start = now;
    sub.current_period_end   = periodEnd;
    sub.last_payment_ref     = paymentRef;
    sub.failed_payment_attempts = 0;

    await this.subRepo.save(sub);

    // Generate billing invoice
    const amount = billing === 'annual'
      ? plan.annualPrice * 12
      : plan.monthlyPrice;
    await this.invoiceSvc.generate(tenantId, planId, amount, billing, paymentRef);

    await this.notifications.create(tenantId, null,
      `✅ ${plan.name} plan activated`,
      `Your subscription is active until ${periodEnd.toLocaleDateString('en-ET')}. Thank you!`,
      '#10B981',
    );

    this.logger.log(`Subscription activated: tenant=${tenantId} plan=${planId} billing=${billing}`);
    return sub;
  }

  // Upgrade or downgrade plan
  async changePlan(tenantId: string, newPlanId: string): Promise<Subscription> {
    const sub = await this.getActive(tenantId);
    const newPlan = PLANS[newPlanId];
    if (!newPlan) throw new BadRequestException('Invalid plan');

    // Enforce usage limits (prevent downgrade if over limit)
    if (newPlan.maxBranches !== -1 && sub.branches_used > newPlan.maxBranches) {
      throw new ForbiddenException(
        `Cannot downgrade: you have ${sub.branches_used} branches but ${newPlan.name} allows ${newPlan.maxBranches}`
      );
    }

    const oldPlan = sub.plan_id;
    sub.plan_id = newPlanId;
    await this.subRepo.save(sub);

    this.logger.log(`Plan change: tenant=${tenantId} ${oldPlan} → ${newPlanId}`);

    await this.notifications.create(tenantId, null,
      `📋 Plan changed to ${newPlan.name}`,
      `Your plan has been updated. Changes take effect immediately.`,
      '#3B82F6',
    );
    return sub;
  }

  // Cancel subscription (at period end)
  async cancel(tenantId: string, reason?: string): Promise<Subscription> {
    const sub = await this.getActive(tenantId);
    sub.cancelled_at = new Date();
    sub.status = 'active'; // still active until period ends
    await this.subRepo.save(sub);

    this.logger.log(`Cancellation scheduled: tenant=${tenantId} reason="${reason}"`);

    await this.notifications.create(tenantId, null,
      '📋 Subscription cancellation scheduled',
      `Your EthioPOS subscription will end on ${sub.current_period_end?.toLocaleDateString('en-ET')}. We hope to serve you again!`,
      '#F97316',
    );
    return sub;
  }

  // Check feature access (gate-keeping)
  async canAccess(tenantId: string, feature: string): Promise<boolean> {
    const sub = await this.getSubscription(tenantId);
    if (!sub) return false;
    if (sub.status === 'suspended' || sub.status === 'cancelled') return false;
    if (sub.status === 'trial') return true; // full access during trial

    const plan = PLANS[sub.plan_id];
    if (!plan) return false;

    const featureGates: Record<string, string[]> = {
      accounting:   ['professional', 'enterprise'],
      hr:           ['professional', 'enterprise'],
      invoices:     ['professional', 'enterprise'],
      warehouse:    ['professional', 'enterprise'],
      ai:           ['professional', 'enterprise'],
      api:          ['enterprise'],
      multi_branch: ['professional', 'enterprise'],
    };

    const allowed = featureGates[feature];
    if (!allowed) return true; // feature not gated
    return allowed.includes(sub.plan_id);
  }

  // Usage tracking
  async trackUsage(tenantId: string, metric: 'branches' | 'users' | 'skus', value: number) {
    const sub = await this.getSubscription(tenantId);
    if (!sub) return;
    const plan = PLANS[sub.plan_id];

    const field = `${metric}_used` as keyof Subscription;
    const limit = plan[`max${metric.charAt(0).toUpperCase() + metric.slice(1)}` as keyof typeof plan] as number;

    if (limit !== -1 && (value + (sub[field] as number)) > limit) {
      throw new ForbiddenException(
        `${metric} limit reached (${limit}). Upgrade to ${metric === 'branches' ? 'Professional' : 'Enterprise'} for more.`
      );
    }
    await this.subRepo.update({ tenant_id: tenantId }, { [field]: value });
  }

  async getSubscription(tenantId: string): Promise<Subscription | null> {
    return this.subRepo.findOne({ where: { tenant_id: tenantId } });
  }

  async getActive(tenantId: string): Promise<Subscription> {
    const sub = await this.getSubscription(tenantId);
    if (!sub) throw new BadRequestException('No subscription found');
    return sub;
  }

  // ── Scheduled jobs ─────────────────────────────────────────

  // Daily: check trial expirations
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleTrialExpirations() {
    const expiring = await this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'trial' })
      .andWhere('s.trial_ends_at <= :soon', { soon: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) })
      .getMany();

    for (const sub of expiring) {
      const daysLeft = Math.ceil((sub.trial_ends_at.getTime() - Date.now()) / 86400000);
      await this.notifications.create(sub.tenant_id, null,
        `⏰ Trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        `Upgrade now to keep your EthioPOS data and avoid interruption. Plans start at ETB 299/month.`,
        '#F97316',
      );
      this.logger.log(`Trial expiry warning: tenant=${sub.tenant_id} daysLeft=${daysLeft}`);
    }

    // Suspend tenants whose trials expired
    const expired = await this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'trial' })
      .andWhere('s.trial_ends_at < :now', { now: new Date() })
      .getMany();

    for (const sub of expired) {
      await this.subRepo.update(sub.id, { status: 'suspended' });
      await this.notifications.create(sub.tenant_id, null,
        '🔒 Trial expired — upgrade to continue',
        'Your free trial has ended. Upgrade to a paid plan to restore full access.',
        '#EF4444',
      );
      this.logger.warn(`Trial expired and suspended: tenant=${sub.tenant_id}`);
    }
  }

  // Monthly: generate billing and charge renewals
  @Cron('0 8 1 * *') // 8AM on 1st of each month
  async handleMonthlyRenewals() {
    const due = await this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.billing = :billing', { billing: 'monthly' })
      .andWhere('s.current_period_end <= :tomorrow', {
        tomorrow: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .andWhere('s.cancelled_at IS NULL')
      .getMany();

    this.logger.log(`Processing ${due.length} monthly renewals`);
    for (const sub of due) await this.renewSubscription(sub);
  }

  // Annual renewals
  @Cron('0 8 * * *') // daily — catches annual renewals on their due date
  async handleAnnualRenewals() {
    const due = await this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.billing = :billing', { billing: 'annual' })
      .andWhere('DATE(s.current_period_end) = CURRENT_DATE')
      .andWhere('s.cancelled_at IS NULL')
      .getMany();

    for (const sub of due) await this.renewSubscription(sub);
  }

  private async renewSubscription(sub: Subscription) {
    const plan   = PLANS[sub.plan_id];
    const amount = sub.billing === 'annual' ? plan.annualPrice * 12 : plan.monthlyPrice;

    try {
      // Attempt payment via stored payment method
      const payRef = `RENEW-${sub.tenant_id.slice(0,8)}-${Date.now()}`;
      // In production: call Telebirr/CBE standing order or prompt re-payment
      this.logger.log(`Renewal initiated: tenant=${sub.tenant_id} amount=ETB ${amount}`);

      // Extend period
      const newEnd = new Date(sub.current_period_end);
      if (sub.billing === 'annual') newEnd.setFullYear(newEnd.getFullYear() + 1);
      else newEnd.setMonth(newEnd.getMonth() + 1);

      await this.subRepo.update(sub.id, {
        current_period_start:   sub.current_period_end,
        current_period_end:     newEnd,
        failed_payment_attempts:0,
        last_payment_ref:       payRef,
      });

      await this.invoiceSvc.generate(sub.tenant_id, sub.plan_id, amount, sub.billing, payRef);
      await this.notifications.create(sub.tenant_id, null,
        `✅ Subscription renewed — ${plan.name}`,
        `ETB ${amount.toLocaleString()} charged. Your plan is active until ${newEnd.toLocaleDateString('en-ET')}.`,
        '#10B981',
      );
    } catch {
      // Payment failed — start dunning sequence
      const attempts = sub.failed_payment_attempts + 1;
      await this.subRepo.update(sub.id, { failed_payment_attempts: attempts });
      this.logger.warn(`Renewal failed: tenant=${sub.tenant_id} attempt=${attempts}`);

      if (attempts >= 3) {
        await this.subRepo.update(sub.id, { status: 'suspended' });
        await this.notifications.create(sub.tenant_id, null,
          '🔒 Account suspended — payment failed',
          `We were unable to process your payment after 3 attempts. Please update your payment method.`,
          '#EF4444',
        );
      } else {
        await this.notifications.create(sub.tenant_id, null,
          `⚠️ Payment failed (attempt ${attempts}/3)`,
          `We couldn't process your ETB ${amount.toLocaleString()} renewal. We will retry in 3 days.`,
          '#F97316',
        );
      }
    }
  }
}

// ─── src/billing/invoice.service.ts ──────────────────────────
import * as ExcelJS from 'exceljs';

@Injectable()
export class BillingInvoiceService {
  constructor(@InjectRepository(BillingInvoice) private repo: Repository<BillingInvoice>) {}

  async generate(tenantId: string, planId: string, amount: number, billing: string, ref: string) {
    const plan = PLANS[planId];
    const inv  = this.repo.create({
      tenant_id:    tenantId,
      invoice_no:   `SINV-${Date.now().toString().slice(-6)}`,
      plan_id:      planId,
      plan_name:    plan.name,
      amount,
      vat:          Math.round(amount * 0.15 * 100) / 100,
      total:        Math.round(amount * 1.15 * 100) / 100,
      billing_cycle:billing,
      payment_ref:  ref,
      status:       'paid',
    });
    return this.repo.save(inv);
  }

  async generatePDF(invoiceId: string): Promise<Buffer> {
    const inv = await this.repo.findOneBy({ id: invoiceId });
    // Generate a simple text-based invoice buffer
    const lines = [
      'EthioPOS — SAAS SUBSCRIPTION INVOICE',
      '═══════════════════════════════════════',
      `Invoice No:   ${inv.invoice_no}`,
      `Date:         ${new Date().toLocaleDateString('en-ET')}`,
      `Plan:         ${inv.plan_name} (${inv.billing_cycle})`,
      `Amount:       ETB ${inv.amount.toLocaleString()}`,
      `VAT (15%):    ETB ${inv.vat.toLocaleString()}`,
      `Total:        ETB ${inv.total.toLocaleString()}`,
      `Payment Ref:  ${inv.payment_ref}`,
      '═══════════════════════════════════════',
      'Thank you for choosing EthioPOS!',
      'support@ethiopos.et · +251 115 570 000',
    ];
    return Buffer.from(lines.join('\n'), 'utf8');
  }

  async getByTenant(tenantId: string) {
    return this.repo.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
      take: 24,
    });
  }
}

// ─── src/billing/billing.controller.ts ───────────────────────
import { Controller, Get, Post, Patch, Body, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private billing: BillingService,
    private invoiceSvc: BillingInvoiceService,
  ) {}

  @Get('subscription')
  getSubscription(@CurrentUser() u: any) {
    return this.billing.getSubscription(u.tenant_id);
  }

  @Get('plans')
  getPlans() { return PLANS; }

  @Post('subscribe')
  subscribe(@CurrentUser() u: any, @Body() dto: { planId: string; billing: 'monthly' | 'annual'; paymentRef: string }) {
    return this.billing.activateSubscription(u.tenant_id, dto.planId, dto.billing, dto.paymentRef);
  }

  @Patch('plan')
  changePlan(@CurrentUser() u: any, @Body() dto: { planId: string }) {
    return this.billing.changePlan(u.tenant_id, dto.planId);
  }

  @Post('cancel')
  cancel(@CurrentUser() u: any, @Body() dto: { reason?: string }) {
    return this.billing.cancel(u.tenant_id, dto.reason);
  }

  @Get('invoices')
  getInvoices(@CurrentUser() u: any) {
    return this.invoiceSvc.getByTenant(u.tenant_id);
  }

  @Get('invoices/:id/pdf')
  async downloadInvoice(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.invoiceSvc.generatePDF(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="EthioPOS-Invoice-${id}.pdf"`);
    res.send(buffer);
  }

  @Get('access/:feature')
  checkAccess(@CurrentUser() u: any, @Param('feature') feature: string) {
    return this.billing.canAccess(u.tenant_id, feature).then(ok => ({ feature, access: ok }));
  }
}
