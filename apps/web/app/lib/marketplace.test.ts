// Hiển thị marketplace (tóm tắt môn, lịch, ngân sách, query trang tìm kiếm) và ánh xạ form bài đăng -> body API.
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { createI18n } from './i18n';
import {
  budgetLabel,
  pageHref,
  pickQuery,
  sortKey,
  summarizeSlots,
  summarizeSubjects,
} from './marketplace';
import {
  requestPostBody,
  requestPostFieldErrors,
  requestPostValues,
  tutorPostBody,
  tutorPostFieldErrors,
  tutorPostValues,
} from './posts-form';

const t = createI18n('vi').t;

describe('marketplace display', () => {
  it('summarizes subjects by subject with grade ranges', () => {
    const subjects = [
      { id: 1, label: 'Toán' },
      { id: 2, label: 'Vật lý' },
    ];
    const grades = [6, 7, 8, 9].map((n) => ({ id: n, label: `Lớp ${n}` }));
    expect(
      summarizeSubjects(
        [
          { subjectId: 1, gradeLevelId: 6 },
          { subjectId: 1, gradeLevelId: 7 },
          { subjectId: 1, gradeLevelId: 8 },
          { subjectId: 2, gradeLevelId: 9 },
          { subjectId: 99, gradeLevelId: 9 },
        ],
        subjects,
        grades,
      ),
    ).toBe('Toán Lớp 6 – Lớp 8; Vật lý Lớp 9');
  });

  it('groups days that share the same time range', () => {
    expect(
      summarizeSlots(t, [
        { weekday: 1, startTime: '18:00', endTime: '20:00' },
        { weekday: 3, startTime: '18:00', endTime: '20:00' },
        { weekday: 7, startTime: '08:00', endTime: '10:00' },
      ]),
    ).toBe('Thứ Hai, Thứ Tư: 18:00–20:00 · Chủ nhật: 08:00–10:00');
  });

  it.each([
    [{ minVnd: 150_000, maxVnd: 200_000, unit: 'session' }, '150.000 – 200.000đ / buổi'],
    [{ minVnd: null, maxVnd: 200_000, unit: 'month' }, 'Đến 200.000đ / tháng'],
    [{ minVnd: 150_000, maxVnd: null, unit: 'hour' }, 'Từ 150.000đ / giờ'],
    [{ minVnd: 200_000, maxVnd: 200_000, unit: 'session' }, '200.000đ / buổi'],
  ] as const)('labels the budget %o', (budget, expected) => {
    expect(budgetLabel(t, 'vi', budget)).toBe(expected);
  });

  it('builds sort label keys without nesting', () => {
    expect(sortKey('rate_asc')).toBe('sortRateAsc');
    expect(sortKey('relevance')).toBe('sortRelevance');
  });

  it('keeps only known, non-empty query keys and builds page links', () => {
    const url = new URL('http://web.test/tutors?q=+toan+&subjectId=&mode=online&evil=1&page=3');
    const query = pickQuery(url, ['q', 'subjectId', 'mode', 'page']);
    expect(query.toString()).toBe('q=toan&mode=online&page=3');
    query.delete('page');
    expect(pageHref('/tutors', query, 2)).toBe('/tutors?q=toan&mode=online&page=2');
    expect(pageHref('/tutors', query, 1)).toBe('/tutors?q=toan&mode=online');
  });
});

const apiError = (details: { path: string; code: string }[]) =>
  new ApiError('validation_failed', 422, 'x', undefined, {
    details: details.map((d) => ({ ...d, message: 'x' })),
  });

describe('tutor post form', () => {
  it('maps form values to the API body', () => {
    const values = {
      ...tutorPostValues(null, 'vi'),
      title: 'Toán 9',
      description: 'Luyện thi',
      teachingMode: 'online',
      rateAmount: '200.000đ',
      rateUnit: 'session',
      capacity: '3',
      availableFrom: '01/12/2026',
      subjects: JSON.stringify([{ subjectId: 1, gradeLevelId: 9 }]),
      areaIds: '[10]',
      slots: JSON.stringify([{ weekday: 2, startTime: '18:00', endTime: '20:00' }]),
    };
    expect(tutorPostBody(values)).toEqual({
      title: 'Toán 9',
      description: 'Luyện thi',
      teachingMode: 'online',
      rate: { amountVnd: 200_000, unit: 'session' },
      capacity: 3,
      availableFrom: '2026-12-01',
      subjects: [{ subjectId: 1, gradeLevelId: 9 }],
      // Dạy trực tuyến thì bỏ khu vực.
      areaIds: [],
      slots: [{ weekday: 2, startTime: '18:00', endTime: '20:00' }],
    });
    expect(
      tutorPostBody({ ...values, rateAmount: '', capacity: '', availableFrom: '' }),
    ).toMatchObject({ rate: null, capacity: null, availableFrom: null });
  });

  it('puts API errors on the right field', () => {
    expect(
      tutorPostFieldErrors(
        apiError([
          { path: 'rate.amountVnd', code: 'invalid_amount' },
          { path: 'subjects', code: 'required' },
          { path: 'slots.1.endTime', code: 'end_before_start' },
          { path: 'title', code: 'made_up_code' },
        ]),
      ),
    ).toEqual({
      rateAmount: { key: 'validation.invalid_amount' },
      subjects: { key: 'validation.required' },
      slots: { key: 'validation.end_before_start' },
      title: { key: 'validation.invalid' },
    });
  });
});

describe('request post form', () => {
  it('maps form values to the API body', () => {
    const values = {
      ...requestPostValues(null, 'vi'),
      learnerId: 'child-1',
      subjectId: '1',
      gradeLevelId: '8',
      teachingMode: 'in_person',
      provinceId: '1',
      communeId: '10',
      budgetMin: '',
      budgetMax: '250.000',
      desiredStartDate: '15/12/2026',
    };
    expect(requestPostBody(values)).toMatchObject({
      subjectId: 1,
      gradeLevelId: 8,
      goal: 'reinforce',
      teachingMode: 'in_person',
      provinceId: 1,
      communeId: 10,
      budget: { minVnd: null, maxVnd: 250_000, unit: 'session' },
      desiredStartDate: '2026-12-15',
    });
    expect('learnerId' in requestPostBody(values)).toBe(false);
    expect(requestPostBody({ ...values, budgetMax: '' }).budget).toBeNull();
  });

  it('puts budget errors on the budget fields', () => {
    expect(
      requestPostFieldErrors(
        apiError([
          { path: 'budget.minVnd', code: 'budget_range' },
          { path: 'provinceId', code: 'province_required_for_in_person' },
          { path: 'subjectId', code: 'request_post_exists' },
        ]),
      ),
    ).toEqual({
      budgetMin: { key: 'validation.budget_range' },
      provinceId: { key: 'validation.province_required_for_in_person' },
      subjectId: { key: 'validation.request_post_exists' },
    });
  });
});
