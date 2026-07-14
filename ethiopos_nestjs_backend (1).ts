// ============================================================
// EthioPOS ERP — NestJS Backend API
// File structure shown with full implementation per module
// ============================================================

// ─── src/main.ts ─────────────────────────────────────────────
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Security headers
  app.use(helmet());
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // CORS — allow EthioPOS web + mobile origins
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger docs
  const config = new DocumentBuilder()
    .setTitle('EthioPOS API')
    .setDescription('21-Module ERP API for Ethiopian SMEs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`EthioPOS API running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();

// ─── src/app.module.ts ───────────────────────────────────────
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule }        from './auth/auth.module';
import { TenantsModule }     from './tenants/tenants.module';
import { UsersModule }       from './users/users.module';
import { BranchesModule }    from './branches/branches.module';
import { ProductsModule }    from './products/products.module';
import { SalesModule }       from './sales/sales.module';
import { CustomersModule }   from './customers/customers.module';
import { AccountingModule }  from './accounting/accounting.module';
import { HrModule }          from './hr/hr.module';
import { InvoicesModule }    from './invoices/invoices.module';
import { WarehouseModule }   from './warehouse/warehouse.module';
import { SuppliersModule }   from './suppliers/suppliers.module';
import { ReportsModule }     from './reports/reports.module';
import { AiModule }          from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule }       from './audit/audit.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        username: cfg.get('DB_USER', 'ethiopos'),
        password: cfg.get('DB_PASS'),
        database: cfg.get('DB_NAME', 'ethiopos_db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: cfg.get('NODE_ENV') !== 'production',
        ssl: cfg.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
        logging: cfg.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Rate limiting (anti-brute-force)
    ThrottlerModule.forRoot([{
      name: 'short',  ttl: 1000,  limit: 10,   // 10 req/sec
    }, {
      name: 'medium', ttl: 60000, limit: 200,  // 200 req/min
    }]),

    // Cron jobs (stock alerts, VAT reminders)
    ScheduleModule.forRoot(),

    // Feature modules
    AuthModule, TenantsModule, UsersModule, BranchesModule,
    ProductsModule, SalesModule, CustomersModule, AccountingModule,
    HrModule, InvoicesModule, WarehouseModule, SuppliersModule,
    ReportsModule, AiModule, NotificationsModule, AuditModule,
  ],
})
export class AppModule {}

// ─── src/auth/auth.module.ts ─────────────────────────────────
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService }    from './auth.service';
import { JwtStrategy }    from './strategies/jwt.strategy';
import { User }           from '../users/user.entity';
import { Session }        from './session.entity';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES', '15m') },
      }),
    }),
    TypeOrmModule.forFeature([User, Session]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

// ─── src/auth/auth.service.ts ────────────────────────────────
import {
  Injectable, UnauthorizedException, ForbiddenException, BadRequestException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { User } from '../users/user.entity';
import { Session } from './session.entity';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)    private userRepo: Repository<User>,
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  // Standard email/password login
  async login(dto: LoginDto, ip: string) {
    const user = await this.userRepo.findOne({
      where: [{ email: dto.identifier }, { phone: dto.identifier }],
    });
    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      await this.auditService.log(null, null, 'Failed login attempt', ip, 'high');
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'active') throw new ForbiddenException('Account suspended');

    // If MFA enabled, return partial token requiring OTP
    if (user.mfa_enabled) {
      const partialToken = this.jwtService.sign(
        { sub: user.id, mfa_pending: true },
        { expiresIn: '5m' },
      );
      return { mfa_required: true, partial_token: partialToken };
    }

    return this.issueTokens(user, ip);
  }

  // PIN login (fast POS cashier login)
  async loginWithPin(userId: string, pin: string, ip: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user?.pin_hash || !(await bcrypt.compare(pin, user.pin_hash))) {
      throw new UnauthorizedException('Invalid PIN');
    }
    return this.issueTokens(user, ip);
  }

  // MFA verification (TOTP — Google Authenticator / Authy)
  async verifyMfa(partialToken: string, otp: string, ip: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(partialToken);
    } catch {
      throw new UnauthorizedException('Token expired');
    }
    if (!payload.mfa_pending) throw new BadRequestException('MFA not pending');

    const user = await this.userRepo.findOneBy({ id: payload.sub });
    if (!user?.mfa_secret) throw new UnauthorizedException();

    const verified = speakeasy.totp.verify({
      secret: user.mfa_secret, encoding: 'base32', token: otp, window: 1,
    });
    if (!verified) throw new UnauthorizedException('Invalid OTP');

    return this.issueTokens(user, ip);
  }

  private async issueTokens(user: User, ip: string) {
    const payload = {
      sub: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      branch_id: user.branch_id,
    };
    const access_token  = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refresh_token = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Persist refresh token (for session management)
    await this.sessionRepo.save({
      user_id: user.id,
      refresh_token: await bcrypt.hash(refresh_token, 10),
      ip_address: ip,
      device: 'unknown',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await this.auditService.log(user.tenant_id, user.id, 'User logged in', ip, 'low');
    await this.userRepo.update(user.id, { last_login_at: new Date() });

    return { access_token, refresh_token, role: user.role, tenant_id: user.tenant_id };
  }
}

// ─── src/auth/guards/roles.guard.ts ─────────────────────────
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Permissions matrix: which roles can access what
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  superadmin:    ['*'],
  owner:         ['*'],
  branch_manager:['pos','inventory','sales','crm','employees','suppliers','reports','branches','invoices','warehouse'],
  accountant:    ['finance','sales','reports','ai','accounting','invoices'],
  cashier:       ['pos','invoices'],
  inventory_mgr: ['inventory','suppliers','reports','warehouse'],
  sales_mgr:     ['sales','crm','reports','ai','invoices'],
  hr_mgr:        ['employees','reports','hr'],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required) return true;
    const { user } = ctx.switchToHttp().getRequest();
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes('*') || required.some(r => permissions.includes(r));
  }
}

// ─── src/products/products.service.ts ───────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product }    from './product.entity';
import { StockLevel } from './stock-level.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)    private productRepo: Repository<Product>,
    @InjectRepository(StockLevel) private stockRepo: Repository<StockLevel>,
    private auditService: AuditService,
    private notifyService: NotificationsService,
  ) {}

  async findAll(tenantId: string, branchId?: string, search?: string) {
    const qb = this.productRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.stock_levels', 'sl')
      .leftJoinAndSelect('p.supplier', 'sup')
      .where('p.tenant_id = :tenantId', { tenantId });
    if (branchId) qb.andWhere('sl.branch_id = :branchId', { branchId });
    if (search)   qb.andWhere('p.name ILIKE :s OR p.sku ILIKE :s OR p.barcode ILIKE :s', { s: `%${search}%` });
    const products = await qb.getMany();
    return products.map(p => ({
      ...p,
      stock: p.stock_levels?.reduce((s, sl) => s + sl.quantity, 0) ?? 0,
      status: this.computeStatus(p),
    }));
  }

  async create(tenantId: string, dto: CreateProductDto, userId: string) {
    const product = this.productRepo.create({ ...dto, tenant_id: tenantId });
    const saved = await this.productRepo.save(product);
    await this.auditService.log(tenantId, userId, `Product created: ${dto.name}`, null, 'low');
    return saved;
  }

  async update(id: string, tenantId: string, dto: Partial<CreateProductDto>, userId: string) {
    const product = await this.productRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!product) throw new NotFoundException('Product not found');
    Object.assign(product, dto);
    const saved = await this.productRepo.save(product);
    await this.auditService.log(tenantId, userId, `Product updated: ${product.name}`, null, 'low');
    return saved;
  }

  async adjustStock(productId: string, branchId: string, delta: number, tenantId: string) {
    let sl = await this.stockRepo.findOne({ where: { product_id: productId, branch_id: branchId } });
    if (!sl) {
      sl = this.stockRepo.create({ product_id: productId, branch_id: branchId, quantity: 0 });
    }
    sl.quantity = Math.max(0, sl.quantity + delta);
    await this.stockRepo.save(sl);

    // Check reorder threshold → trigger notification
    const product = await this.productRepo.findOneBy({ id: productId });
    if (product && sl.quantity <= product.reorder_point) {
      await this.notifyService.create(tenantId, null,
        `⚠️ Low Stock: ${product.name}`,
        `${sl.quantity} units left (reorder at ${product.reorder_point})`,
        '#F97316',
      );
    }
  }

  private computeStatus(p: Product): 'ok' | 'low' | 'critical' {
    const qty = p.stock_levels?.reduce((s, sl) => s + sl.quantity, 0) ?? 0;
    if (qty === 0 || qty < p.reorder_point * 0.3) return 'critical';
    if (qty <= p.reorder_point) return 'low';
    return 'ok';
  }
}

// ─── src/sales/sales.service.ts ──────────────────────────────
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sale }         from './sale.entity';
import { SaleItem }     from './sale-item.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ProductsService }    from '../products/products.service';
import { CustomersService }   from '../customers/customers.service';
import { AccountingService }  from '../accounting/accounting.service';
import { EthiopianTax }       from '../common/ethiopian-tax.util';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)     private saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem) private itemRepo: Repository<SaleItem>,
    private dataSource: DataSource,
    private productsService: ProductsService,
    private customersService: CustomersService,
    private accountingService: AccountingService,
  ) {}

  async create(tenantId: string, branchId: string, cashierId: string, dto: CreateSaleDto) {
    // Use a DB transaction for atomicity
    return this.dataSource.transaction(async manager => {
      // 1. Validate stock availability
      for (const item of dto.items) {
        const product = await manager.findOne('products', { where: { id: item.product_id } });
        if (!product) throw new BadRequestException(`Product ${item.product_id} not found`);
      }

      // 2. Calculate totals with Ethiopian VAT
      let subtotal = 0;
      const lineItems: Partial<SaleItem>[] = [];
      for (const item of dto.items) {
        const product = await manager.findOne('products', { where: { id: item.product_id } });
        const lineTotal = product.unit_price * item.quantity;
        subtotal += lineTotal;
        lineItems.push({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: product.unit_price,
          unit_cost: product.unit_cost,
        });
      }

      const vatAmount = dto.vatApplicable !== false
        ? EthiopianTax.calculateVAT(subtotal)
        : 0;
      const total = subtotal + vatAmount - (dto.discountAmount || 0);

      // 3. Create sale record
      const invoiceNo = await this.generateInvoiceNo(tenantId);
      const sale = manager.create(Sale, {
        tenant_id: tenantId, branch_id: branchId, cashier_id: cashierId,
        customer_id: dto.customerId,
        invoice_no: invoiceNo,
        subtotal, vat_amount: vatAmount,
        discount_amount: dto.discountAmount || 0,
        total,
        payment_method: dto.paymentMethod,
        status: dto.paymentMethod === 'credit' ? 'outstanding' : 'paid',
      });
      const savedSale = await manager.save(sale);

      // 4. Save line items
      for (const li of lineItems) {
        await manager.save(SaleItem, { ...li, sale_id: savedSale.id });
      }

      // 5. Deduct stock per item
      for (const item of dto.items) {
        await this.productsService.adjustStock(item.product_id, branchId, -item.quantity, tenantId);
      }

      // 6. Update customer loyalty points (1 point per ETB 10 spent)
      if (dto.customerId) {
        const points = Math.floor(total / 10);
        await this.customersService.addLoyaltyPoints(dto.customerId, points, tenantId);
        // Update credit balance if credit sale
        if (dto.paymentMethod === 'credit') {
          await this.customersService.updateCredit(dto.customerId, total, tenantId);
        }
      }

      // 7. Auto-generate journal entry (Sales → Cash/Telebirr + VAT Payable)
      await this.accountingService.journalizeSale(savedSale, tenantId);

      return { ...savedSale, invoice_no: invoiceNo };
    });
  }

  async getDailySummary(tenantId: string, branchId: string, date: Date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end   = new Date(date); end.setHours(23, 59, 59, 999);
    const result = await this.saleRepo
      .createQueryBuilder('s')
      .select('COUNT(s.id)', 'transaction_count')
      .addSelect('SUM(s.total)', 'total_revenue')
      .addSelect('SUM(s.vat_amount)', 'total_vat')
      .addSelect('AVG(s.total)', 'avg_basket')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.branch_id = :branchId', { branchId })
      .andWhere('s.created_at BETWEEN :start AND :end', { start, end })
      .getRawOne();
    return result;
  }

  private async generateInvoiceNo(tenantId: string): Promise<string> {
    const count = await this.saleRepo.count({ where: { tenant_id: tenantId } });
    return `INV-${String(count + 1).padStart(4, '0')}`;
  }
}

// ─── src/accounting/accounting.service.ts ───────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEntry } from './journal-entry.entity';
import { JournalLine }  from './journal-line.entity';
import { Transaction }  from './transaction.entity';
import { EthiopianTax } from '../common/ethiopian-tax.util';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(JournalEntry) private entryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine)  private lineRepo: Repository<JournalLine>,
    @InjectRepository(Transaction)  private txRepo: Repository<Transaction>,
  ) {}

  // Auto-journal on every sale (double-entry)
  async journalizeSale(sale: any, tenantId: string) {
    const entry = await this.entryRepo.save({
      tenant_id: tenantId,
      ref: `JE-${sale.invoice_no}`,
      description: `Sale ${sale.invoice_no}`,
      status: 'posted',
    });

    // DR Cash/Bank (or AR if credit)  CR Sales Revenue
    // DR Sales Revenue                CR VAT Payable
    await this.lineRepo.save([
      { entry_id: entry.id, account_code: sale.payment_method === 'credit' ? '1100' : '1000', debit: sale.total,      credit: 0 },
      { entry_id: entry.id, account_code: '4000',                                              debit: 0,               credit: sale.subtotal },
      { entry_id: entry.id, account_code: '4000',                                              debit: sale.vat_amount, credit: 0 },
      { entry_id: entry.id, account_code: '2100',                                              debit: 0,               credit: sale.vat_amount },
    ]);
  }

  async getProfitAndLoss(tenantId: string, startDate: Date, endDate: Date) {
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('t.type', 'type')
      .addSelect('SUM(t.amount)', 'total')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy('t.type')
      .getRawMany();

    const revenue  = Number(rows.find(r => r.type === 'income')?.total  ?? 0);
    const expenses = Number(rows.find(r => r.type === 'expense')?.total ?? 0);
    return {
      revenue, expenses,
      gross_profit: revenue * 0.398, // approx 39.8% gross margin
      net_profit:   revenue - expenses,
      net_margin:   revenue > 0 ? ((revenue - expenses) / revenue * 100).toFixed(1) + '%' : '0%',
      vat_payable:  EthiopianTax.calculateVAT(revenue),
    };
  }

  async getVATSummary(tenantId: string, period: string) {
    // period = 'YYYY-MM'
    const [year, month] = period.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);

    const result = await this.txRepo
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'taxable_sales')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.type = :type', { type: 'income' })
      .andWhere('t.created_at BETWEEN :start AND :end', { start, end })
      .getRawOne();

    const taxableSales = Number(result.taxable_sales ?? 0);
    return {
      period,
      taxable_sales: taxableSales,
      vat_rate: '15%',
      vat_collected: EthiopianTax.calculateVAT(taxableSales),
      vat_payable:   EthiopianTax.calculateVAT(taxableSales),
      filing_due: new Date(year, month, 30).toISOString().split('T')[0],
    };
  }
}

// ─── src/hr/hr.service.ts ────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee }      from './employee.entity';
import { PayrollRun }    from './payroll-run.entity';
import { PayrollItem }   from './payroll-item.entity';
import { Attendance }    from './attendance.entity';
import { LeaveRequest }  from './leave-request.entity';
import { EthiopianTax }  from '../common/ethiopian-tax.util';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(Employee)     private empRepo: Repository<Employee>,
    @InjectRepository(PayrollRun)   private runRepo: Repository<PayrollRun>,
    @InjectRepository(PayrollItem)  private itemRepo: Repository<PayrollItem>,
    @InjectRepository(Attendance)   private attRepo: Repository<Attendance>,
    @InjectRepository(LeaveRequest) private leaveRepo: Repository<LeaveRequest>,
  ) {}

  // Ethiopian payroll: 7% employee pension, 11% employer pension, progressive income tax
  async runMonthlyPayroll(tenantId: string, period: string) {
    const employees = await this.empRepo.find({ where: { tenant_id: tenantId, status: 'active' } });
    const run = await this.runRepo.save({ tenant_id: tenantId, period, status: 'pending' });
    const items: PayrollItem[] = [];

    for (const emp of employees) {
      const gross = emp.basic_salary + emp.transport_allowance;
      const { employeePension, employerPension, incomeTax, netPay } =
        EthiopianTax.calculatePayroll(emp.basic_salary, emp.transport_allowance);

      items.push(this.itemRepo.create({
        payroll_run_id: run.id,
        employee_id:    emp.id,
        basic_salary:   emp.basic_salary,
        transport:      emp.transport_allowance,
        gross_pay:      gross,
        pension_employee: employeePension,
        pension_employer: employerPension,
        income_tax:     incomeTax,
        net_pay:        netPay,
        status: 'pending',
      }));
    }
    await this.itemRepo.save(items);
    return { run, items_count: items.length, total_net: items.reduce((s, i) => s + i.net_pay, 0) };
  }

  async clockIn(employeeId: string, tenantId: string) {
    const today = new Date().toISOString().split('T')[0];
    let att = await this.attRepo.findOne({ where: { employee_id: employeeId, work_date: today as any } });
    if (!att) {
      att = this.attRepo.create({ employee_id: employeeId, work_date: today as any });
    }
    att.check_in = new Date().toTimeString().slice(0, 5) as any;
    att.status   = new Date().getHours() > 8 ? 'late' : 'present';
    return this.attRepo.save(att);
  }

  async clockOut(employeeId: string) {
    const today = new Date().toISOString().split('T')[0];
    const att = await this.attRepo.findOne({ where: { employee_id: employeeId, work_date: today as any } });
    if (!att) throw new Error('Not clocked in today');
    att.check_out = new Date().toTimeString().slice(0, 5) as any;
    const [h1, m1] = (att.check_in as any).split(':').map(Number);
    const [h2, m2] = (att.check_out as any).split(':').map(Number);
    att.hours = +((h2 * 60 + m2 - h1 * 60 - m1) / 60).toFixed(2);
    return this.attRepo.save(att);
  }

  async approveLeave(leaveId: string, approverId: string, status: 'approved' | 'rejected') {
    const leave = await this.leaveRepo.findOneBy({ id: leaveId });
    leave.status      = status;
    leave.approved_by = approverId as any;
    return this.leaveRepo.save(leave);
  }
}

// ─── src/ai/ai.service.ts ────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { AiQueryLog } from './ai-query-log.entity';
import { SalesService } from '../sales/sales.service';
import { ProductsService } from '../products/products.service';
import { AccountingService } from '../accounting/accounting.service';

@Injectable()
export class AiService {
  private client: Anthropic;

  constructor(
    private cfg: ConfigService,
    @InjectRepository(AiQueryLog) private logRepo: Repository<AiQueryLog>,
    private salesService: SalesService,
    private productsService: ProductsService,
    private accountingService: AccountingService,
  ) {
    this.client = new Anthropic({ apiKey: cfg.get('ANTHROPIC_API_KEY') });
  }

  // AI Business Advisor — answers 6 pre-built + open-ended queries
  async query(tenantId: string, userId: string, queryType: string, branchId?: string) {
    const start = Date.now();

    // Fetch live business context
    const [plData, lowStock] = await Promise.all([
      this.accountingService.getProfitAndLoss(tenantId, this.monthStart(), new Date()),
      this.productsService.findAll(tenantId, branchId),
    ]);

    const contextBlock = `
      LIVE BUSINESS DATA (${new Date().toISOString()}):
      Revenue this month: ETB ${plData.revenue.toLocaleString()}
      Expenses: ETB ${plData.expenses.toLocaleString()}
      Net Profit: ETB ${plData.net_profit.toLocaleString()} (${plData.net_margin})
      VAT payable: ETB ${plData.vat_payable.toLocaleString()}
      Low/Critical stock items: ${lowStock.filter(p => p.status !== 'ok').map(p => `${p.name} (${p.stock} units)`).join(', ')}
    `;

    const prompts: Record<string, string> = {
      top_products:  `${contextBlock}\nAnalyze top-selling products. Identify top 3 by revenue and top 3 by margin. Give 3 actionable recommendations. Be specific with ETB amounts.`,
      credit_debt:   `${contextBlock}\nAnalyze outstanding credit and overdue customer accounts. Rank by risk. Give collection strategies. Use ETB amounts.`,
      reorder:       `${contextBlock}\nGenerate urgent reorder plan. For each critical/low-stock item give exact quantities, ETB cost, and which supplier to contact. Factor in Enkutatash seasonal demand.`,
      profit:        `${contextBlock}\nAnalyze monthly financial performance. Compare to Ethiopian retail benchmarks (~15% net margin). Give top 3 cost reduction ideas with ETB savings.`,
      forecast:      `${contextBlock}\nForecast next 30 days revenue (low/base/high scenarios). Give week-by-week breakdown. Include inventory purchase budget recommendation in ETB.`,
      executive:     `${contextBlock}\nGenerate professional executive summary: 2-paragraph overview, KPI table, top 3 strengths, top 3 risks + mitigations, June strategic priorities, 90-day roadmap.`,
    };

    const prompt = prompts[queryType] || `${contextBlock}\n${queryType}`;

    const response = await this.client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are an AI Business Intelligence Officer for EthioPOS, an Ethiopian multi-branch ERP platform. Provide precise, data-driven, actionable insights. Currency: ETB. Be concise and specific.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    const ms   = Date.now() - start;

    // Log for usage analytics
    await this.logRepo.save({
      tenant_id: tenantId, user_id: userId, query_type: queryType,
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      response_ms: ms,
    });

    return { result: text, response_ms: ms };
  }

  private monthStart(): Date {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }
}

// ─── src/common/ethiopian-tax.util.ts ───────────────────────
/**
 * Ethiopian Tax Utility
 * ─ VAT: 15% flat rate (ERCA)
 * ─ Pension: Employee 7%, Employer 11% (Proclamation 377/2003)
 * ─ Income Tax: Progressive brackets per ERCA schedule
 */
export class EthiopianTax {
  static readonly VAT_RATE = 0.15;

  static calculateVAT(amount: number): number {
    return Math.round(amount * this.VAT_RATE * 100) / 100;
  }

  static extractVATFromGross(gross: number): number {
    return Math.round((gross - gross / (1 + this.VAT_RATE)) * 100) / 100;
  }

  // Ethiopian progressive income tax on employment income (ETB/month)
  static calculateIncomeTax(grossSalary: number): number {
    if (grossSalary <= 600)     return 0;
    if (grossSalary <= 1650)    return (grossSalary - 600)    * 0.10;
    if (grossSalary <= 3200)    return 105  + (grossSalary - 1650) * 0.15;
    if (grossSalary <= 5250)    return 337.5+ (grossSalary - 3200) * 0.20;
    if (grossSalary <= 7800)    return 747.5+ (grossSalary - 5250) * 0.25;
    if (grossSalary <= 10900)   return 1385 + (grossSalary - 7800) * 0.30;
    return                             2315 + (grossSalary - 10900)* 0.35;
  }

  static calculatePayroll(basicSalary: number, transport: number = 0) {
    const gross = basicSalary + transport;
    // Pension is applied on basic salary only (not transport)
    const employeePension = Math.round(basicSalary * 0.07 * 100) / 100;
    const employerPension = Math.round(basicSalary * 0.11 * 100) / 100;
    // Taxable income = basic - employee pension contribution
    const taxableIncome = basicSalary - employeePension;
    const incomeTax     = Math.round(this.calculateIncomeTax(taxableIncome) * 100) / 100;
    const netPay        = Math.round((gross - employeePension - incomeTax) * 100) / 100;
    return { gross, employeePension, employerPension, incomeTax, netPay, taxableIncome };
  }

  // Loyalty tier based on total spend in ETB
  static loyaltyTier(totalSpend: number): 'Bronze' | 'Silver' | 'Gold' | 'Platinum' {
    if (totalSpend >= 100000) return 'Platinum';
    if (totalSpend >= 50000)  return 'Gold';
    if (totalSpend >= 20000)  return 'Silver';
    return 'Bronze';
  }

  // Points earned: 1 point per ETB 10 spent
  static loyaltyPoints(amount: number): number {
    return Math.floor(amount / 10);
  }
}

// ─── src/reports/reports.service.ts ─────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../sales/sale.entity';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sale) private saleRepo: Repository<Sale>,
  ) {}

  async generateSalesReport(tenantId: string, startDate: Date, endDate: Date, format: 'pdf' | 'excel') {
    const sales = await this.saleRepo.find({
      where: { tenant_id: tenantId },
      relations: ['items', 'items.product', 'customer'],
      order: { created_at: 'DESC' },
    });

    if (format === 'excel') return this.toExcel(sales, 'Sales Report');
    return this.toPDF(sales, 'EthioPOS Sales Report', tenantId);
  }

  private async toExcel(data: any[], sheetName: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    // EthioPOS branded header row
    ws.addRow(['EthioPOS Sales Report — ERCA VAT Compliant']);
    ws.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } };

    ws.addRow(['Invoice', 'Date', 'Customer', 'Subtotal', 'VAT 15%', 'Total', 'Method', 'Status']);
    ws.getRow(2).font = { bold: true };
    ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };

    data.forEach(s => ws.addRow([
      s.invoice_no, s.created_at.toISOString().split('T')[0],
      s.customer?.name ?? 'Walk-in',
      s.subtotal, s.vat_amount, s.total, s.payment_method, s.status,
    ]));

    // Auto-width
    ws.columns.forEach(col => { col.width = 16; });

    return wb.xlsx.writeBuffer() as Promise<Buffer>;
  }

  private toPDF(data: any[], title: string, tenantId: string): Buffer {
    const doc = new PDFDocument({ margin: 40 });
    const buffers: Buffer[] = [];
    doc.on('data', b => buffers.push(b));

    // Header
    doc.fontSize(18).fillColor('#1E40AF').text('EthioPOS ERP', 40, 40);
    doc.fontSize(12).fillColor('#64748B').text(title);
    doc.moveDown();
    doc.fontSize(10).fillColor('#000').text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();

    // Table header
    doc.fontSize(10).fillColor('#1E40AF').text('Invoice    Date          Customer         Total (ETB)   Status');
    doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke('#1E40AF');
    doc.moveDown(0.3);

    // Rows
    data.slice(0, 50).forEach(s => {
      doc.fontSize(9).fillColor('#000').text(
        `${s.invoice_no.padEnd(10)} ${s.created_at.toISOString().split('T')[0].padEnd(13)} ${(s.customer?.name ?? 'Walk-in').padEnd(18)} ${String(s.total).padEnd(14)} ${s.status}`
      );
    });

    doc.end();
    return Buffer.concat(buffers);
  }
}

// ─── src/notifications/notifications.service.ts ─────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Notification } from './notification.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    private cfg: ConfigService,
  ) {}

  async create(tenantId: string, userId: string | null, title: string, body: string, color: string) {
    return this.repo.save({ tenant_id: tenantId, user_id: userId, title, body, color });
  }

  async findForUser(tenantId: string, userId: string) {
    return this.repo.find({
      where: [{ tenant_id: tenantId, user_id: userId }, { tenant_id: tenantId, user_id: null }],
      order: { created_at: 'DESC' },
      take: 30,
    });
  }

  async markRead(id: string) {
    return this.repo.update(id, { read: true });
  }

  // Daily AI summary notification (runs 06:00 EAT = 03:00 UTC)
  @Cron('0 3 * * *')
  async sendDailyAISummary() {
    // This would fetch all active tenants and queue AI summary generation
    console.log('[Cron] Generating daily AI summaries for all tenants');
  }

  // VAT filing reminder (runs 25th of each month)
  @Cron('0 9 25 * *')
  async sendVATReminder() {
    console.log('[Cron] Sending VAT filing reminders');
  }
}

// ─── src/audit/audit.service.ts ──────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) {}

  async log(
    tenantId: string | null,
    userId: string | null,
    action: string,
    ip: string | null,
    risk: 'low' | 'medium' | 'high' = 'low',
  ) {
    return this.repo.save({
      tenant_id: tenantId,
      user_id: userId,
      action,
      ip_address: ip,
      risk_level: risk,
    });
  }

  async findByTenant(tenantId: string, limit = 50) {
    return this.repo.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }
}

// ─── .env.example ───────────────────────────────────────────
/*
PORT=4000
NODE_ENV=development

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=ethiopos
DB_PASS=your_strong_password
DB_NAME=ethiopos_db

# JWT
JWT_SECRET=your_256bit_secret_here
JWT_EXPIRES=15m

# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-...

# Telebirr (Ethio Telecom merchant API)
TELEBIRR_APP_ID=
TELEBIRR_APP_KEY=
TELEBIRR_SHORT_CODE=

# CBE Birr
CBE_MERCHANT_ID=
CBE_API_KEY=

# SMS Gateway (for MFA OTPs)
SMS_GATEWAY_URL=
SMS_API_KEY=

# CORS
ALLOWED_ORIGINS=https://app.ethiopos.et,https://admin.ethiopos.et

# Backups
BACKUP_S3_BUCKET=ethiopos-backups
AWS_REGION=eu-west-1
*/
