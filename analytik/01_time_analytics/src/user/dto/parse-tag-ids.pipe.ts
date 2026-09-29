import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
@Injectable()
export class ParseTagIdsPipe implements PipeTransform<any, number[]> {
  transform(value: any): number[] {
    if (!value) return [];
    const rawParts = Array.isArray(value) ? value : String(value).split(',');
    const parts = rawParts.flatMap((s: any) => String(s).split(',')).map((s: string) => s.trim()).filter(Boolean);
    const nums: number[] = [];
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (isNaN(n) || n <= 0) throw new BadRequestException(`Invalid tagId: ${p}`);
      nums.push(n);
    }
    return nums;
  }
}
