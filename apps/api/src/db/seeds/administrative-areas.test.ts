import { describe, expect, it } from '@jest/globals';
import { sampleDataset } from '../../../test/fixtures/vn-units-sample.js';
import { AreaSeedError, toAreaRows } from './administrative-areas.js';

const SAMPLE_COUNTS = { provinces: 2, communes: 3 };

describe('toAreaRows', () => {
  it('maps provinces first, then communes with their unit type and parent', () => {
    const rows = toAreaRows(sampleDataset(), SAMPLE_COUNTS);
    expect(rows.map((r) => r.code)).toEqual(['01', '91', '00004', '00008', '31105']);
    expect(rows[0]).toEqual({
      code: '01',
      level: 'province',
      unitType: 'municipality',
      parentCode: null,
      name: 'Hà Nội',
      fullName: 'Thành phố Hà Nội',
      nameEn: 'Hanoi',
      nameAscii: 'Ha Noi',
      postalCode: null,
    });
    expect(rows[1]?.unitType).toBe('province');
    expect(rows[4]).toMatchObject({
      level: 'commune',
      unitType: 'special_zone',
      parentCode: '91',
      nameAscii: 'Phu Quoc',
      postalCode: '92500',
    });
  });

  it('lists every problem at once', () => {
    const data = sampleDataset();
    data[0]!.Wards[1]!.Code = '00004'; // trùng mã
    data[1]!.Wards[0]!.ProvinceCode = '01'; // nằm sai tỉnh
    data[1]!.Code = '9'; // mã tỉnh sai định dạng
    data[1]!.AdministrativeUnitId = 7; // loại đơn vị lạ

    expect.assertions(5);
    try {
      toAreaRows(data, SAMPLE_COUNTS);
    } catch (error) {
      expect(error).toBeInstanceOf(AreaSeedError);
      const problems = (error as AreaSeedError).problems.join('\n');
      expect(problems).toContain('00004: trùng mã');
      expect(problems).toContain('31105: thuộc tỉnh 01 nhưng nằm trong 9');
      expect(problems).toContain('9: mã tỉnh (2 chữ số) sai định dạng');
      expect(problems).toContain('9: loại đơn vị 7 chưa được hỗ trợ');
    }
  });

  it('checks the expected counts', () => {
    expect(() => toAreaRows(sampleDataset())).toThrow(/Có 2 tỉnh\/thành, mong đợi 34/);
    expect(() => toAreaRows(sampleDataset(), null)).not.toThrow();
  });

  it('rejects a file with the wrong structure', () => {
    expect(() => toAreaRows({ provinces: [] }, SAMPLE_COUNTS)).toThrow(/Sai cấu trúc tệp nguồn/);
  });
});
