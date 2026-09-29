import { Injectable } from '@nestjs/common';
import Bottleneck from 'bottleneck';

@Injectable()
export class CrmRateLimiter {
  private limiters = new Map<number, Bottleneck>();
  private cooldowns = new Map<number, number>();
  private rps = parseInt(process.env.AMO_CRM_RATE_LIMIT_RPS || '5', 10);

  getForAccount(accountId: number): Bottleneck {
    const id = accountId > 0 ? accountId : 0;
    let l = this.limiters.get(id);
    if (!l) {
      l = new Bottleneck({
        reservoir: this.rps,
        reservoirRefreshAmount: this.rps,
        reservoirRefreshInterval: 1000,
        maxConcurrent: 1,
        minTime: 0,
      });
      this.limiters.set(id, l);
    }
    return l;
  }

  setCooldown(accountId: number, waitMs: number) {
    const id = accountId > 0 ? accountId : 0;
    const until = Date.now() + waitMs;
    const current = this.cooldowns.get(id) || 0;
    if (until > current) {
      this.cooldowns.set(id, until);
    }
  }

  async waitCooldown(accountId: number): Promise<void> {
    const id = accountId > 0 ? accountId : 0;
    const until = this.cooldowns.get(id);
    if (!until) return;
    const diff = until - Date.now();
    if (diff > 0) {
      await new Promise((r) => setTimeout(r, diff));
    }
  }

  remove(accountId: number) {
    const id = accountId > 0 ? accountId : 0;
    this.cooldowns.delete(id);
    const l = this.limiters.get(id);
    if (l) {
      l.disconnect();
      this.limiters.delete(id);
    }
  }
}
