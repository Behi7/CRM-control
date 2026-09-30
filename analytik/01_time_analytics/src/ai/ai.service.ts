import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { UserService } from '../user/user.service';
import { AppException } from '../common/exceptions/app.exception';
import { AiChatDto } from './dto/chat.dto';

function formatDuration(seconds: number | null | undefined, lang: 'ru' | 'uz' = 'ru'): string {
  if (seconds === null || seconds === undefined) return '—';
  if (!seconds) return lang === 'uz' ? '0 son' : '0 сек';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (lang === 'uz') {
    if (d > 0) parts.push(`${d}k`);
    if (h > 0) parts.push(`${h}s`);
    if (m > 0) parts.push(`${m}d`);
    return parts.join(' ') || '<1d';
  } else {
    if (d > 0) parts.push(`${d}д`);
    if (h > 0) parts.push(`${h}ч`);
    if (m > 0) parts.push(`${m}м`);
    return parts.join(' ') || '<1м';
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private userService: UserService,
  ) {}

  async getAiStatus(accountId: number) {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { aiEnabled: true, aiModel: true, aiEncryptedToken: true },
    });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');

    const hasToken = !!acc.aiEncryptedToken;
    const isReady = Boolean(acc.aiEnabled && hasToken);

    return {
      enabled: isReady,
      configured: hasToken,
      model: acc.aiModel || 'gemini-2.5-flash',
    };
  }

  async testConnection(model: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
    const cleanModel = (model || 'gemini-2.5-flash').trim().replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey.trim()}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Ответь одним словом "OK" для проверки связи.' }] }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        const errDetail = errJson?.error?.message || `HTTP ${resp.status} ${resp.statusText}`;
        return { ok: false, message: `Ошибка Gemini API: ${errDetail}` };
      }

      return { ok: true, message: 'Соединение с моделью успешно проверено!' };
    } catch (e: any) {
      return { ok: false, message: `Ошибка сети/таймаут: ${e.message}` };
    }
  }

  async chat(accountId: number, dto: AiChatDto) {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');

    if (!acc.aiEnabled || !acc.aiEncryptedToken) {
      throw new AppException('AI_NOT_CONFIGURED', 400, 'ИИ не подключен для этого аккаунта в админке');
    }

    let apiKey: string;
    try {
      apiKey = this.crypto.decrypt(acc.aiEncryptedToken);
    } catch (e) {
      this.logger.error(`Failed to decrypt AI token for account ${accountId}`, e);
      throw new AppException('INTERNAL_ERROR', 500, 'Не удалось расшифровать ключ ИИ');
    }

    const cleanModel = (acc.aiModel || 'gemini-2.5-flash').trim().replace(/^models\//, '');

    // BI ANALYTICS (MODULE 02) CONTEXT HANDLER
    if (dto.biData) {
      const bi = dto.biData;
      const selected = Array.isArray(dto.biSelectedBlocks) && dto.biSelectedBlocks.length > 0
        ? dto.biSelectedBlocks
        : ['overview'];
      const isUz = dto.lang === 'uz';

      let biContext = isUz ? "=== AMO-CRM BI ANALITIKA MA'LUMOTLARI ===\n" : "=== ДАННЫЕ BI-АНАЛИТИКИ AMOCRM С ЭКРАНА ПОЛЬЗОВАТЕЛЯ ===\n";

      // 1. Overview block
      if (selected.includes('overview') && bi.kpis) {
        const k = bi.kpis;
        biContext += isUz
          ? `\n[1. UMUMIY KPI VA MOLIYA]:\n- Jami bitimlar: ${k.totalLeads}\n- Muvaffaqiyatli (Won): ${k.wonLeads} ta, Tushum: ${k.totalRevenue}\n- Ish jarayonida (Open Pipeline): ${k.openLeads} ta, Potensial: ${k.openPipelineValue}\n- Rad etilgan (Lost): ${k.lostLeads} ta, Yo'qotilgan summa: ${k.lostRevenue}\n- O'rtacha chek: ${k.avgCheck}, Mediana chek: ${k.medianCheck}\n- Konversiya (Win Rate): ${k.winRateClosed}% (barcha yaratilganlardan: ${k.winRateTotal}%)\n- Vazifasiz bitimlar: ${k.noTaskLeads}, Kechiktirilgan vazifali: ${k.overdueTasksLeads}\n`
          : `\n[1. СВОДНЫЕ KPI И ФИНАНСЫ]:\n- Всего сделок: ${k.totalLeads}\n- Успешно (Won): ${k.wonLeads} шт., Выручка: ${k.totalRevenue}\n- В работе (Open Pipeline): ${k.openLeads} шт., Потенциал: ${k.openPipelineValue}\n- Закрыто в отказ (Lost): ${k.lostLeads} шт., Упущенная выручка: ${k.lostRevenue}\n- Средний чек: ${k.avgCheck}, Медианный чек: ${k.medianCheck}\n- Конверсия (Win Rate): ${k.winRateClosed}% (от всех лидов: ${k.winRateTotal}%)\n- Сделок без задач: ${k.noTaskLeads}, С просроченными задачами: ${k.overdueTasksLeads}\n`;

        if (Array.isArray(bi.timeseries) && bi.timeseries.length > 0) {
          biContext += isUz ? "\nOYLAR BO'YICHA DINAMIKA:\n" : "\nДИНАМИКА ПО МЕСЯЦАМ:\n";
          for (const m of bi.timeseries.slice(-12)) {
            biContext += `  * ${m.period}: Jami/Всего=${m.totalLeads}, Won=${m.wonLeads}, Lost=${m.lostLeads}, Open=${m.openLeads}, Tushum/Выручка=${m.revenue}\n`;
          }
        }
      }

      // 2. Managers block
      if (selected.includes('managers') && Array.isArray(bi.managers)) {
        biContext += isUz ? "\n[2. MENEJERLAR REYTINQI VA INTIZOMI]:\n" : "\n[2. РЕЙТИНГ И ДИСЦИПЛИНА МЕНЕДЖЕРОВ]:\n";
        for (const m of bi.managers) {
          biContext += `  * ${m.managerName}: Bitimlar=${m.totalLeads}, Won=${m.wonLeads}, Lost=${m.lostLeads}, Open=${m.openLeads}, WinRate=${m.winRate}%, Tushum=${m.revenue}, O'rtachaChek=${m.avgCheck}, Vazifasiz=${m.noTaskLeads}, Kechiktirilgan=${m.overdueTasksLeads}\n`;
        }
      }

      // 3. Marketing & Sources block
      if (selected.includes('marketing') && bi.marketing) {
        biContext += isUz ? "\n[3. BITIMLAR MANBALARI (AMOCRM MANBALAR)]:\n" : "\n[3. ИСТОЧНИКИ СДЕЛОК AMOCRM И ТРАФИК]:\n";
        if (Array.isArray(bi.marketing.utmSources)) {
          for (const s of bi.marketing.utmSources.slice(0, 15)) {
            biContext += `  * Manba: "${s.source}" -> Lidlar=${s.totalLeads} (${s.sharePercent || 0}%), Won=${s.wonLeads}, CR=${s.winRate}%, Tushum=${s.revenue}\n`;
          }
        }
        if (Array.isArray(bi.marketing.tagsBreakdown) && bi.marketing.tagsBreakdown.length > 0) {
          biContext += isUz ? "\nTEGLAR BO'YICHA TAHLIL:\n" : "\nАНАЛИЗ ПО ТЕГАМ:\n";
          for (const t of bi.marketing.tagsBreakdown.slice(0, 10)) {
            biContext += `  * #${t.tagName}: Lidlar=${t.totalLeads}, Won=${t.wonLeads}, CR=${t.winRate}%, Tushum=${t.revenue}\n`;
          }
        }
      }

      // 4. Loss Reasons block
      if (selected.includes('losses') && bi.lossesAndLtv && Array.isArray(bi.lossesAndLtv.lossReasons)) {
        biContext += isUz ? "\n[4. RAD ETISH SABABLARI]:\n" : "\n[4. ПРИЧИНЫ ОТКАЗА]:\n";
        for (const lr of bi.lossesAndLtv.lossReasons.slice(0, 15)) {
          biContext += `  * Sabab: "${lr.reason}" -> Yo'qotilgan bitimlar=${lr.lostLeads} (${lr.sharePercent}%), Yo'qotilgan summa=${lr.lostValue}, O'rtacha chek=${lr.avgLostCheck || 0}\n`;
        }
      }

      // 5. Custom Fields Lists block
      if (selected.includes('custom_fields') && bi.marketing && Array.isArray(bi.marketing.customFieldsLists)) {
        biContext += isUz ? "\n[5. RO'YXATLI MAYDONLAR TAHLILI (CUSTOM FIELDS BI)]:\n" : "\n[5. АНАЛИТИКА ПО СПИСОЧНЫМ КАСТОМНЫМ ПОЛЯМ]:\n";
        for (const g of bi.marketing.customFieldsLists.slice(0, 6)) {
          biContext += `  * Maydon: "${g.fieldName}" (Jami to'ldirilgan=${g.totalFilled}, WinRate=${g.winRate}%, Tushum=${g.wonValue}):\n`;
          for (const opt of (g.options || []).slice(0, 6)) {
            biContext += `      - "${opt.fieldValue}": Bitimlar=${opt.totalLeads} (${opt.shareOfField}%), Won=${opt.wonLeads}, WinRate=${opt.winRate}%, Tushum=${opt.wonValue}\n`;
          }
        }
      }

      // 6. Risk Deals block
      if (selected.includes('risk_deals') && bi.lossesAndLtv && Array.isArray(bi.lossesAndLtv.riskDeals)) {
        biContext += isUz ? "\n[6. XAVF OSTIDAGI BITIMLAR AUDITI (TOP-25)]:\n" : "\n[6. АУДИТ СДЕЛОК В ЗОНЕ РИСКА (ТОП-25)]:\n";
        for (const d of bi.lossesAndLtv.riskDeals.slice(0, 10)) {
          biContext += `  * "${d.name}": Byudjet=${d.price}, Bosqich=${d.stageName}, Menejer=${d.managerName}, Harakatsiz=${d.idleDays} kun, Xavf turi=${d.riskType}\n`;
        }
      }

      let biSysInstruction = '';
      if (isUz) {
        biSysInstruction = `Sen — amoCRM bo'yicha yetakchi Biznes-Tahlilchi (Lead BI Analyst) va Sotuvlar bo'yicha Bosh Direktor (Chief Revenue Officer)san.\n`;
        biSysInstruction += `Sening maqsading — sotuv bo'limi rahbari (ROP) va kompaniya asoschisiga tushumni oshirish, qayerda pul yo'qotilayotganini aniqlash, konversiyani oshirish va menejerlar intizomini yaxshilashda yordam berish.\n\n`;
        if (acc.aiCompanyContext) {
          biSysInstruction += `=== KOMPANIYA HAQIDA MA'LUMOT ===\n${acc.aiCompanyContext}\n\n`;
        }
        biSysInstruction += biContext + `\n\n=== JAVOB QOIDALARI ===
1. ALBATTA O'ZBEK TILIDA (lotin yozuvida), aniq biznes uslubida javob ber.
2. FOYDALANUVCHIDAN HECH QACHON QO'SHIMCHA MA'LUMOT SO'RAMA — barcha kerakli raqamlar yuqoridagi kontekstda keltirilgan!
3. Raqamlarni chuqur tahlil qil:
   - Pul va konversiya oqishlari (leakage): qaysi manbalar yoki rad sabablari eng ko'p zarar keltirmoqda.
   - Menejerlar samaradorligi: kim tushumni ta'minlayapti, kimda qoldirilgan yoki muddati o'tgan vazifalar ko'p.
   - ROP uchun 3-4 ta qat'iy va amalga oshirish mumkin bo'lgan tavsiyalar ber.
4. Muhim raqamlar va xulosalarni **qalin shrift (bold)** bilan ajratib ko'rsat.`;
      } else {
        biSysInstruction = `Ты — ведущий Бизнес-Аналитик (Lead BI Analyst) и Директор по продажам (Chief Revenue Officer) по системе amoCRM.\n`;
        biSysInstruction += `Твоя цель — помогать руководителю отдела продаж (РОПу) и основателю компании увеличивать выручку, находить утечки денег, поднимать конверсию и наводить порядок в CRM-дисциплине.\n\n`;
        if (acc.aiCompanyContext) {
          biSysInstruction += `=== ИНФОРМАЦИЯ О КОМПАНИИ ===\n${acc.aiCompanyContext}\n\n`;
        }
        biSysInstruction += biContext + `\n\n=== ПРАВИЛА ОТВЕТА ===
1. Отвечай на русском языке в профессиональном структурированном стиле.
2. СТРОЖАЙШЕ ЗАПРЕЩЕНО просить пользователя предоставить данные — ВСЕ ЦИФРЫ С ЭКРАНА УЖЕ ПЕРЕД ТОБОЙ!
3. Опирайся строго на предоставленные выше цифры выбранных блоков:
   - Вскрывай финансовые утечки (какие источники мусорные, какие причины отказа сжирают бюджет).
   - Оценивай работу менеджеров (кто делает выручку, а у кого завал просроченных задач и слив лидов).
   - Давай РОПу 3-4 конкретных управленческих шага для внедрения прямо сегодня.
4. Выделяй ключевые суммы, конверсии и имена **жирным шрифтом**.`;
      }

      // Execute AI call for BI
      return this.executeAiCall(cleanModel, apiKey, biSysInstruction, dto.history, dto.message, isUz);
    }

    // 1. Determine pipeline to analyze (use provided or fallback to first active)
    let targetPipelineId = dto.pipelineId;
    let funnelPipelineName = '';

    if (targetPipelineId) {
      const pipeline = await this.prisma.pipeline.findFirst({
        where: { id: targetPipelineId, accountId, isArchived: false },
        select: { id: true, name: true },
      });
      if (!pipeline) {
        throw new AppException('FORBIDDEN', 403, 'Указанная воронка не найдена или не принадлежит данному аккаунту');
      }
      funnelPipelineName = pipeline.name;
    } else {
      const firstPipeline = await this.prisma.pipeline.findFirst({
        where: { accountId, isArchived: false },
        orderBy: { id: 'asc' },
      });
      targetPipelineId = firstPipeline?.id;
      funnelPipelineName = firstPipeline?.name || '';
    }

    let funnelContextText = '';

    if (targetPipelineId) {
      try {

        const filters = dto.filters || {};
        const stats = await this.userService.getStagesStats(
          targetPipelineId,
          filters.tagIds,
          filters.status,
          filters.managerIds,
          filters.dateFrom,
          filters.dateTo,
        );

        const isUz = dto.lang === 'uz';
        const filterDescParts: string[] = [];
        if (filters.status && filters.status !== 'all') {
          const statusLabels: Record<string, string> = isUz
            ? { won: 'Muvaffaqiyatli', lost: 'Rad etilgan', open: 'Ish jarayonida' }
            : { won: 'Успешно', lost: 'Отказ', open: 'В работе' };
          filterDescParts.push(`${isUz ? 'Holat' : 'Статус'}: ${statusLabels[filters.status] || filters.status}`);
        }
        if (filters.dateFrom || filters.dateTo) {
          filterDescParts.push(
            isUz
              ? `Yaratilgan davri: ${filters.dateFrom || 'boshidan'} dan ${filters.dateTo || 'bugungacha'}`
              : `Период создания: с ${filters.dateFrom || 'начала'} по ${filters.dateTo || 'сегодня'}`
          );
        }
        if (filters.managerIds && filters.managerIds.length > 0) {
          filterDescParts.push(
            isUz
              ? `${filters.managerIds.length} ta menejer bo'yicha filtr`
              : `Фильтр по ${filters.managerIds.length} менеджерам`
          );
        }
        if (filters.tagIds && filters.tagIds.length > 0) {
          filterDescParts.push(
            isUz
              ? `${filters.tagIds.length} ta teg bo'yicha filtr`
              : `Фильтр по ${filters.tagIds.length} тегам`
          );
        }

        const filterSummary = filterDescParts.length > 0
          ? filterDescParts.join(' | ')
          : (isUz ? 'Barcha bitimlar cheklovlarsiz' : 'Все сделки без ограничений');

        let tableText = isUz
          ? `Voronka: "${funnelPipelineName}"\nQo'llanilgan filtrlar: ${filterSummary}\n\n`
          : `Воронка: "${funnelPipelineName}"\nПримененные фильтры: ${filterSummary}\n\n`;

        tableText += isUz
          ? `VORONKA BOSQICHLARI JADVALI (CRM BAZASIDAGI HAQIQIY MA'LUMOTLAR):\n| Bosqich | O'rtacha vaqt (fakt) | Sakrashlar bilan o'rtacha | Sakrashlar (o'tkazib yuborish) | Bosqichdan o'tgan (bitimlar) | Hozirda bosqichda |\n|---|---|---|---|---|---|\n`
          : `ТАБЛИЦА ЭТАПОВ ВОРОНКИ (РЕАЛЬНЫЕ ДАННЫЕ ИЗ БАЗЫ CRM):\n| Этап | Среднее время (факт) | Среднее с перепрыгами | Перепрыгов (пропусков) | Прошли этап (сделок) | Сейчас на этапе |\n|---|---|---|---|---|---|\n`;

        for (const s of stats.items || []) {
          const isWon = s.externalId === '142';
          const isLost = s.externalId === '143';
          const successTag = isUz ? '[Muvaffaqiyat]' : '[Успех]';
          const failTag = isUz ? '[Rad etilgan]' : '[Отказ]';
          const nameWithTag = isWon ? `${s.name} ${successTag}` : isLost ? `${s.name} ${failTag}` : s.name;
          const actualTime = isWon || isLost ? '—' : formatDuration(s.avgSecondsActual, dto.lang);
          const withSkips = isWon || isLost ? '—' : formatDuration(s.avgSecondsIncludingSkips, dto.lang);
          const skips = isWon || isLost ? '—' : String(s.skipsCount);

          tableText += `| ${nameWithTag} | ${actualTime} | ${withSkips} | ${skips} | ${s.leadsCount} | ${s.activeLeadsCount} |\n`;
        }

        funnelContextText = tableText;
      } catch (err) {
        this.logger.warn(`Failed to collect pipeline stats for AI: ${err}`);
      }
    }

    // 2. Build system instructions
    const isUz = dto.lang === 'uz';
    let systemInstruction = '';
    if (isUz) {
      systemInstruction = `Sen — amoCRM savdo voronkalarini optimallashtirish va bitimlar davriyligi vaqtini qisqartirish bo'yicha yetakchi biznes-tahlilchi hamda ekspertsan.\n`;
      systemInstruction += `Sening maqsading — sotuv bo'limi rahbari (ROP) va kompaniya rahbariyatiga kechikishlar, tor joylar (bottlenecks), bosqichlarni sakrab o'tish anomaliyalarini aniqlashda yordam berish va aniq amaliy tavsiyalar berish.\n\n`;

      if (acc.aiCompanyContext) {
        systemInstruction += `=== KOMPANIYA VA BIZNES-JARAYONLAR HAQIDA MA'LUMOT ===\n${acc.aiCompanyContext}\n\n`;
      }

      if (funnelContextText) {
        systemInstruction += `=== FOYDALANUVCHI EKRANIDAGI VORONKA MA'LUMOTLARI ===\n${funnelContextText}\n\n`;
      } else {
        systemInstruction += `=== VORONKA MA'LUMOTLARI ===\nTizimda voronka hali tanlanmagan yoki unda bitimlar mavjud emas. Foydalanuvchidan interfeysda voronkani tanlashni so'ra.\n\n`;
      }

      systemInstruction += `=== JAVOB BERISH QOIDALARI ===
1. Javobni ALBATTA O'ZBEK TILIDA (lotin yozuvida), ravon va professional biznes uslubida ber.
2. VORONKANING BARCHA MA'LUMOTLARI YUQORIDA "VORONKA BOSQICHLARI JADVALI" QISMIDA TO'LIQ KELTIRILGAN.
3. Foydalanuvchidan hech qachon qo'shimcha ma'lumotlar, skrinshotlar yoki jadvallarni so'rama — barcha kerakli raqamlar allaqachon sening ko'z oldingda!
4. Keltirilgan jadval bo'yicha chuqur tahlil o'tkaz:
   - Bitimlar eng uzoq ushlanib qolayotgan aniq bosqichlarni ko'rsat (tor joylar / bottlenecks).
   - Sakrab o'tishlar eng ko'p bo'lgan bosqichlarga e'tibor qarat (menejerlar reglamentni chetlab o'tgan joylar).
   - Hozirgi paytda eng ko'p faol bitimlar to'plangan bosqichlarni aniqla.
   - Sotuv bo'limi rahbari (ROP) uchun jarayonni tezlashtirish bo'yicha 3-4 ta qat'iy va amaliy tavsiya ber.
5. Muhim raqamlar, vaqtlar va bosqich nomlarini **qalin shrift (bold)** bilan belgilab ber.
6. Javobni aniq tuzilma, qisqa xulosalar va punktlar bilan bayon et.`;
    } else {
      systemInstruction = `Ты — ведущий бизнес-аналитик и эксперт по оптимизации воронок продаж amoCRM и сокращению времени цикла сделки.\n`;
      systemInstruction += `Твоя цель — помогать руководителю отдела продаж (РОПу) и руководству компании находить задержки, узкие горлышки (bottlenecks), аномалии с перепрыгиванием этапов и давать конкретные практические рекомендации.\n\n`;

      if (acc.aiCompanyContext) {
        systemInstruction += `=== ИНФОРМАЦИЯ О КОМПАНИИ И БИЗНЕС-ПРОЦЕССАХ ===\n${acc.aiCompanyContext}\n\n`;
      }

      if (funnelContextText) {
        systemInstruction += `=== ДАННЫЕ ВОРОНКИ НА ЭКРАНЕ ПОЛЬЗОВАТЕЛЯ ===\n${funnelContextText}\n\n`;
      } else {
        systemInstruction += `=== ДАННЫЕ ВОРОНКИ ===\nВоронка в системе ещё не выбрана или не содержит сделок. Попроси пользователя выбрать воронку в интерфейсе.\n\n`;
      }

      systemInstruction += `=== ПРАВИЛА ОТВЕТА ===
1. Отвечай на русском языке.
2. ВСЕ ДАННЫЕ ВОРОНКИ УЖЕ ПРЕДОСТАВЛЕНЫ ТЕБЕ ВЫШЕ В БЛОКЕ "ТАБЛИЦА ЭТАПОВ ВОРОНКИ".
3. СТРОЖАЙШЕ ЗАПРЕЩЕНО просить пользователя предоставить данные, скриншоты или таблицы — они уже у тебя перед глазами!
4. Сразу проводи анализ по предоставленной таблице:
   - Назови конкретные этапы с самым долгим временем нахождения (узкие места / bottlenecks).
   - Обрати внимание на этапы с частыми перепрыгами (где менеджеры срезают путь в обход регламента).
   - Укажи, на каких этапах сейчас скопилось больше всего активных сделок.
   - Дай 3-4 жесткие и практичные рекомендации для РОПа по исправлению ситуации.
5. Выделяй важные цифры и названия этапов **жирным шрифтом**.
6. Отвечай структурированно, профессионально и без общих фраз.`;
    }

    return this.executeAiCall(cleanModel, apiKey, systemInstruction, dto.history, dto.message, isUz);
  }

  private async executeAiCall(
    cleanModel: string,
    apiKey: string,
    systemInstruction: string,
    history: any[] | undefined,
    userMessage: string,
    isUz: boolean,
  ) {
    const contents: any[] = [];

    if (history && Array.isArray(history)) {
      for (const h of history) {
        if (h.text && (h.role === 'user' || h.role === 'model')) {
          contents.push({
            role: h.role,
            parts: [{ text: h.text }],
          });
        }
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        const msg = errJson?.error?.message || `HTTP ${resp.status}: ${resp.statusText}`;
        this.logger.error(`Gemini API error: ${msg}`);
        throw new AppException('AI_SERVICE_ERROR', 502, `Ошибка ИИ сервиса: ${msg}`);
      }

      const resJson = await resp.json();
      const reply = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || (isUz ? "Modeldan javob olib bo'lmadi." : 'Не удалось получить ответ от модели.');

      return { reply };
    } catch (e: any) {
      if (e instanceof AppException) throw e;
      this.logger.error(`Failed to call Gemini API: ${e.message}`, e.stack);
      throw new AppException('AI_SERVICE_ERROR', 504, `Таймаут или сбой обращения к ИИ: ${e.message}`);
    }
  }
}

