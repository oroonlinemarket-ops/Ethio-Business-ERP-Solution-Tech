// ============================================================
// EthioPOS — Data Migration & Import Tool
// Imports: Products · Customers · Suppliers · Opening stock
// Formats: Excel (.xlsx) · CSV · Manual entry
// ============================================================

// ─── src/migration/migration.module.ts ───────────────────────
import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule }  from '@nestjs/platform-express';
import { diskStorage }   from 'multer';
import { MigrationController } from './migration.controller';
import { MigrationService }    from './migration.service';
import { ImportJob }           from './import-job.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJob]),
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/imports',
        filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
      fileFilter: (_, file, cb) => {
        const allowed = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  ],
  controllers: [MigrationController],
  providers:   [MigrationService],
  exports:     [MigrationService],
})
export class MigrationModule {}

// ─── src/migration/migration.service.ts ──────────────────────
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as fs      from 'fs';
import * as csv     from 'csv-parse/sync';
import { ImportJob } from './import-job.entity';

export type ImportType = 'products' | 'customers' | 'suppliers' | 'opening_stock' | 'sales_history';

export interface ImportResult {
  jobId:      string;
  type:       ImportType;
  total:      number;
  imported:   number;
  skipped:    number;
  errors:     ImportError[];
  duration_ms:number;
}

export interface ImportError {
  row:     number;
  field:   string;
  value:   any;
  message: string;
}

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    @InjectRepository(ImportJob) private jobRepo: Repository<ImportJob>,
    private dataSource: DataSource,
  ) {}

  // ── Main import dispatcher ───────────────────────────────────
  async importFile(
    tenantId: string,
    branchId: string,
    filePath: string,
    type: ImportType,
    userId: string,
  ): Promise<ImportResult> {
    const start = Date.now();
    const rows  = await this.parseFile(filePath, type);

    const job = await this.jobRepo.save({
      tenant_id: tenantId,
      user_id:   userId,
      type,
      status:    'processing',
      total:     rows.length,
    });

    let result: ImportResult;

    switch (type) {
      case 'products':      result = await this.importProducts(tenantId, branchId, rows, job.id); break;
      case 'customers':     result = await this.importCustomers(tenantId, rows, job.id);          break;
      case 'suppliers':     result = await this.importSuppliers(tenantId, rows, job.id);          break;
      case 'opening_stock': result = await this.importOpeningStock(tenantId, branchId, rows, job.id); break;
      case 'sales_history': result = await this.importSalesHistory(tenantId, branchId, rows, job.id); break;
      default: throw new BadRequestException(`Unknown import type: ${type}`);
    }

    result.duration_ms = Date.now() - start;

    await this.jobRepo.update(job.id, {
      status:    result.errors.length === 0 ? 'completed' : 'completed_with_errors',
      imported:  result.imported,
      skipped:   result.skipped,
      errors:    JSON.stringify(result.errors),
      completed_at: new Date(),
    });

    // Cleanup uploaded file
    try { fs.unlinkSync(filePath); } catch {}

    this.logger.log(`Import complete: type=${type} total=${result.total} imported=${result.imported} errors=${result.errors.length} time=${result.duration_ms}ms`);
    return result;
  }

  // ── Products import ──────────────────────────────────────────
  private async importProducts(tenantId: string, branchId: string, rows: any[], jobId: string): Promise<ImportResult> {
    const errors: ImportError[] = [];
    let imported = 0; let skipped = 0;

    // Expected columns: SKU, Name, Category, Selling Price, Cost Price, Reorder Point, Barcode, Supplier
    const REQUIRED = ['name', 'unit_price'];

    await this.dataSource.transaction(async manager => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2: 1-indexed + header row

        // Validate required fields
        const rowErrors = this.validateRow(row, REQUIRED, rowNum);

        // Validate price
        if (isNaN(Number(row.unit_price)) || Number(row.unit_price) < 0) {
          rowErrors.push({ row: rowNum, field: 'unit_price', value: row.unit_price, message: 'Must be a non-negative number' });
        }

        if (rowErrors.length > 0) { errors.push(...rowErrors); skipped++; continue; }

        try {
          // Check for existing product by SKU or name
          const existing = await manager.findOne('products', {
            where: [
              { tenant_id: tenantId, sku: row.sku?.trim() || undefined },
              { tenant_id: tenantId, name: row.name.trim() },
            ],
          });

          if (existing) {
            // Update existing product
            await manager.update('products', existing.id, {
              name:          row.name.trim(),
              category:      row.category?.trim() || 'General',
              unit_price:    Number(row.unit_price),
              unit_cost:     Number(row.cost_price || row.unit_cost || 0),
              reorder_point: Number(row.reorder_point || 10),
              barcode:       row.barcode?.trim() || null,
            });
          } else {
            // Create new product
            const product = manager.create('products', {
              tenant_id:     tenantId,
              sku:           row.sku?.trim() || `SKU-${Date.now()}-${i}`,
              barcode:       row.barcode?.trim() || null,
              name:          row.name.trim(),
              category:      row.category?.trim() || 'General',
              unit_price:    Number(row.unit_price),
              unit_cost:     Number(row.cost_price || row.unit_cost || 0),
              reorder_point: Number(row.reorder_point || 10),
            } as any);
            const saved = await manager.save(product);

            // Create opening stock record if provided
            if (row.opening_stock && !isNaN(Number(row.opening_stock))) {
              await manager.save(manager.create('stock_levels', {
                product_id: saved.id,
                branch_id:  branchId,
                quantity:   Number(row.opening_stock),
              } as any));
            }
          }
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', value: null, message: err.message });
          skipped++;
        }
      }
    });

    return { jobId, type: 'products', total: rows.length, imported, skipped, errors, duration_ms: 0 };
  }

  // ── Customers import ─────────────────────────────────────────
  private async importCustomers(tenantId: string, rows: any[], jobId: string): Promise<ImportResult> {
    const errors: ImportError[] = [];
    let imported = 0; let skipped = 0;

    // Expected: Name, Phone, City, Credit Limit
    await this.dataSource.transaction(async manager => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        if (!row.name?.trim()) {
          errors.push({ row: rowNum, field: 'name', value: row.name, message: 'Customer name is required' });
          skipped++; continue;
        }

        // Validate Ethiopian phone number
        if (row.phone && !/^(09|07|\+2519|\+2517)\d{8}$/.test(row.phone.replace(/\s/g, ''))) {
          errors.push({ row: rowNum, field: 'phone', value: row.phone, message: 'Invalid Ethiopian phone (09xxxxxxxx or +2519xxxxxxxx)' });
        }

        try {
          const existing = await manager.findOne('customers', { where: { tenant_id: tenantId, phone: row.phone?.trim() } });
          if (existing) { skipped++; continue; } // Skip duplicates

          await manager.save(manager.create('customers', {
            tenant_id:    tenantId,
            name:         row.name.trim(),
            phone:        row.phone?.trim() || null,
            city:         row.city?.trim() || null,
            credit_limit: Number(row.credit_limit || 0),
            loyalty_tier: 'Bronze',
          } as any));
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', value: null, message: err.message });
          skipped++;
        }
      }
    });

    return { jobId, type: 'customers', total: rows.length, imported, skipped, errors, duration_ms: 0 };
  }

  // ── Suppliers import ─────────────────────────────────────────
  private async importSuppliers(tenantId: string, rows: any[], jobId: string): Promise<ImportResult> {
    const errors: ImportError[] = [];
    let imported = 0; let skipped = 0;

    await this.dataSource.transaction(async manager => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.name?.trim()) { skipped++; continue; }
        try {
          await manager.save(manager.create('suppliers', {
            tenant_id: tenantId,
            name:      row.name.trim(),
            contact:   row.contact?.trim(),
            phone:     row.phone?.trim(),
            city:      row.city?.trim(),
            category:  row.category?.trim() || 'General',
            rating:    Number(row.rating || 3),
          } as any));
          imported++;
        } catch (err: any) {
          errors.push({ row: i + 2, field: 'general', value: null, message: err.message });
          skipped++;
        }
      }
    });

    return { jobId, type: 'suppliers', total: rows.length, imported, skipped, errors, duration_ms: 0 };
  }

  // ── Opening stock import ─────────────────────────────────────
  private async importOpeningStock(tenantId: string, branchId: string, rows: any[], jobId: string): Promise<ImportResult> {
    const errors: ImportError[] = [];
    let imported = 0; let skipped = 0;

    // Expected: SKU or Product Name, Quantity, Branch (optional)
    await this.dataSource.transaction(async manager => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        if (!row.sku && !row.name) {
          errors.push({ row: rowNum, field: 'sku', value: null, message: 'SKU or product name required' });
          skipped++; continue;
        }

        const product = await manager.findOne('products', {
          where: row.sku
            ? { tenant_id: tenantId, sku: row.sku.trim() }
            : { tenant_id: tenantId, name: row.name.trim() },
        });

        if (!product) {
          errors.push({ row: rowNum, field: 'sku', value: row.sku, message: `Product not found: ${row.sku || row.name}` });
          skipped++; continue;
        }

        const qty = Number(row.quantity);
        if (isNaN(qty) || qty < 0) {
          errors.push({ row: rowNum, field: 'quantity', value: row.quantity, message: 'Quantity must be a non-negative number' });
          skipped++; continue;
        }

        try {
          const existing = await manager.findOne('stock_levels', {
            where: { product_id: (product as any).id, branch_id: branchId },
          });
          if (existing) {
            await manager.update('stock_levels', { product_id: (product as any).id, branch_id: branchId }, { quantity: qty });
          } else {
            await manager.save(manager.create('stock_levels', { product_id: (product as any).id, branch_id: branchId, quantity: qty } as any));
          }
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', value: null, message: err.message });
          skipped++;
        }
      }
    });

    return { jobId, type: 'opening_stock', total: rows.length, imported, skipped, errors, duration_ms: 0 };
  }

  // ── Sales history import ─────────────────────────────────────
  private async importSalesHistory(tenantId: string, branchId: string, rows: any[], jobId: string): Promise<ImportResult> {
    const errors: ImportError[] = [];
    let imported = 0; let skipped = 0;

    // Expected: Date, Invoice No, Customer Name/Phone, Product SKU, Qty, Unit Price, Payment Method
    await this.dataSource.transaction(async manager => {
      const cashierId = await manager.findOne('users', {
        where: { tenant_id: tenantId, role: 'owner' as any },
      }).then(u => (u as any)?.id ?? null);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        if (!row.date || !row.product_sku || !row.quantity || !row.unit_price) {
          errors.push({ row: rowNum, field: 'general', value: null, message: 'Missing required: date, product_sku, quantity, unit_price' });
          skipped++; continue;
        }

        const product = await manager.findOne('products', { where: { tenant_id: tenantId, sku: row.product_sku.trim() } });
        if (!product) { errors.push({ row: rowNum, field: 'product_sku', value: row.product_sku, message: 'Product SKU not found' }); skipped++; continue; }

        try {
          const saleDate    = new Date(row.date);
          const qty         = Number(row.quantity);
          const unitPrice   = Number(row.unit_price);
          const subtotal    = qty * unitPrice;
          const vatAmount   = Math.round(subtotal * 0.15 * 100) / 100;
          const total       = subtotal + vatAmount;
          const payMethod   = row.payment_method?.toLowerCase().replace(/\s/g, '_') || 'cash';

          const sale = await manager.save(manager.create('sales', {
            tenant_id:      tenantId,
            branch_id:      branchId,
            cashier_id:     cashierId,
            invoice_no:     row.invoice_no || `HIST-${Date.now()}-${i}`,
            subtotal,
            vat_amount:     vatAmount,
            discount_amount:0,
            total,
            payment_method: ['cash','telebirr','cbe_birr','credit','bank_transfer','cheque'].includes(payMethod) ? payMethod : 'cash',
            status:         'paid',
            created_at:     saleDate,
          } as any));

          await manager.save(manager.create('sale_items', {
            sale_id:    sale.id,
            product_id: (product as any).id,
            quantity:   qty,
            unit_price: unitPrice,
            unit_cost:  Number(row.unit_cost || (product as any).unit_cost || 0),
          } as any));

          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', value: null, message: err.message });
          skipped++;
        }
      }
    });

    return { jobId, type: 'sales_history', total: rows.length, imported, skipped, errors, duration_ms: 0 };
  }

  // ── File parser ──────────────────────────────────────────────
  private async parseFile(filePath: string, type: ImportType): Promise<any[]> {
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const content = fs.readFileSync(filePath, 'utf8');
      return csv.parse(content, {
        columns:       true,
        skip_empty_lines: true,
        trim:          true,
        cast:          true,
        // Map common column name variants to standard names
        on_record: (record: any) => this.normalizeColumnNames(record, type),
      });
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const wb   = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const ws   = wb.worksheets[0];
      const rows: any[] = [];
      let headers: string[] = [];

      ws.eachRow((row, idx) => {
        if (idx === 1) {
          headers = (row.values as any[]).slice(1).map(v => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_'));
        } else {
          const values = (row.values as any[]).slice(1);
          if (values.some(v => v !== null && v !== undefined && v !== '')) {
            const record: any = {};
            headers.forEach((h, i) => { record[h] = values[i] ?? null; });
            rows.push(this.normalizeColumnNames(record, type));
          }
        }
      });
      return rows;
    }

    throw new BadRequestException('Unsupported file format. Use .csv or .xlsx');
  }

  // Normalize common column name variants to standard field names
  private normalizeColumnNames(record: any, type: ImportType): any {
    const ALIASES: Record<string, string> = {
      // Product aliases
      'product_name': 'name', 'item_name': 'name', 'description': 'name',
      'selling_price': 'unit_price', 'price': 'unit_price', 'sale_price': 'unit_price',
      'cost': 'unit_cost', 'purchase_price': 'unit_cost', 'cost_price': 'unit_cost',
      'reorder': 'reorder_point', 'min_stock': 'reorder_point',
      'stock': 'opening_stock', 'qty': 'quantity', 'qty_on_hand': 'opening_stock',
      // Customer aliases
      'customer_name': 'name', 'full_name': 'name', 'contact_name': 'name',
      'phone_number': 'phone', 'mobile': 'phone', 'tel': 'phone',
      // Sales aliases
      'sale_date': 'date', 'transaction_date': 'date',
      'sku': 'product_sku', 'product_code': 'product_sku', 'item_code': 'product_sku',
      'amount': 'unit_price', 'rate': 'unit_price',
      'payment': 'payment_method', 'method': 'payment_method',
    };

    const normalized: any = {};
    for (const [key, val] of Object.entries(record)) {
      const cleanKey = key.toLowerCase().trim().replace(/\s+/g, '_');
      normalized[ALIASES[cleanKey] ?? cleanKey] = val;
    }
    return normalized;
  }

  private validateRow(row: any, required: string[], rowNum: number): ImportError[] {
    return required
      .filter(f => !row[f] && row[f] !== 0)
      .map(f => ({ row: rowNum, field: f, value: row[f], message: `${f} is required` }));
  }

  // Generate import template files (Excel)
  async generateTemplate(type: ImportType): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${type} Import`);

    const templates: Record<ImportType, { headers: string[]; example: any[] }> = {
      products: {
        headers: ['SKU', 'Name*', 'Category', 'Selling Price (ETB)*', 'Cost Price (ETB)', 'Reorder Point', 'Opening Stock', 'Barcode', 'Supplier'],
        example: [
          ['P001', 'Cooking Oil 5L', 'Grocery', '250', '190', '20', '48', '8001234567890', 'Nile Trading'],
          ['P002', 'Sugar 5kg',      'Grocery', '180', '140', '30', '100','8002345678901', 'Ethio Sugar'],
        ],
      },
      customers: {
        headers: ['Name*', 'Phone', 'City', 'Credit Limit (ETB)'],
        example: [
          ['Selam Tesfaye', '0911234567', 'Addis Ababa', '5000'],
          ['Abebe Girma',   '0922345678', 'Merkato',     '2000'],
        ],
      },
      suppliers: {
        headers: ['Name*', 'Contact Person', 'Phone', 'City', 'Category', 'Rating (1-5)'],
        example: [
          ['Nile Trading PLC', 'Habtamu', '+251911001100', 'Addis Ababa', 'Grocery', '5'],
          ['Local Mills Ltd',  'Girma',   '+251933003300', 'Sheger City', 'Grain',   '4'],
        ],
      },
      opening_stock: {
        headers: ['SKU*', 'Product Name', 'Quantity*', 'Branch'],
        example: [
          ['P001', 'Cooking Oil 5L', '48', 'Bole Main'],
          ['P002', 'Sugar 5kg',      '5',  'Bole Main'],
        ],
      },
      sales_history: {
        headers: ['Date* (YYYY-MM-DD)', 'Invoice No', 'Customer Phone', 'Product SKU*', 'Quantity*', 'Unit Price (ETB)*', 'Cost Price (ETB)', 'Payment Method'],
        example: [
          ['2026-05-28', 'INV-001', '0911234567', 'P001', '2', '250', '190', 'cash'],
          ['2026-05-28', 'INV-002', '0922345678', 'P002', '5', '180', '140', 'telebirr'],
        ],
      },
    };

    const tmpl = templates[type];
    // Header row
    ws.addRow(tmpl.headers);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
    // Example rows
    tmpl.example.forEach(row => ws.addRow(row));
    // Instructions
    ws.addRow([]);
    ws.addRow(['* = Required field']);
    ws.addRow(['Payment methods: cash, telebirr, cbe_birr, credit, bank_transfer, cheque']);
    // Auto-width
    ws.columns.forEach(col => { col.width = 22; });

    return wb.xlsx.writeBuffer() as Promise<Buffer>;
  }

  async getJobStatus(jobId: string, tenantId: string) {
    return this.jobRepo.findOne({ where: { id: jobId, tenant_id: tenantId } });
  }

  async getJobHistory(tenantId: string) {
    return this.jobRepo.find({ where: { tenant_id: tenantId }, order: { created_at: 'DESC' }, take: 20 });
  }
}

// ─── src/migration/migration.controller.ts ───────────────────
import { Controller, Post, Get, Param, Query, UploadedFile, UseInterceptors, Res, UseGuards, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response }        from 'express';
import { JwtAuthGuard }    from '../auth/guards/jwt-auth.guard';
import { CurrentUser }     from '../auth/decorators/current-user.decorator';
import { Roles }           from '../auth/decorators/roles.decorator';

@Controller('migration')
@UseGuards(JwtAuthGuard)
export class MigrationController {
  constructor(private migrationService: MigrationService) {}

  @Post('import')
  @Roles('owner', 'branch_manager', 'inventory_mgr')
  @UseInterceptors(FileInterceptor('file'))
  async importFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: ImportType,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded. Accepted: .csv or .xlsx');
    return this.migrationService.importFile(
      user.tenant_id, user.branch_id, file.path, type, user.id,
    );
  }

  @Get('template/:type')
  async downloadTemplate(@Param('type') type: ImportType, @Res() res: Response) {
    const buffer = await this.migrationService.generateTemplate(type);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="EthioPOS-${type}-template.xlsx"`);
    res.send(buffer);
  }

  @Get('jobs')
  getHistory(@CurrentUser() user: any) {
    return this.migrationService.getJobHistory(user.tenant_id);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string, @CurrentUser() user: any) {
    return this.migrationService.getJobStatus(id, user.tenant_id);
  }
}

// ─── src/migration/import-job.entity.ts ──────────────────────
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('import_jobs')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')  id:         string;
  @Column()                        tenant_id:  string;
  @Column()                        user_id:    string;
  @Column()                        type:       string;
  @Column({ default: 'pending' })  status:     string; // pending | processing | completed | completed_with_errors | failed
  @Column({ default: 0 })          total:      number;
  @Column({ default: 0 })          imported:   number;
  @Column({ default: 0 })          skipped:    number;
  @Column({ type: 'text', nullable: true }) errors: string;
  @Column({ type: 'timestamptz', nullable: true }) completed_at: Date;
  @CreateDateColumn()              created_at: Date;
}
