import { describe, expect, it } from 'vitest';
import {
  AcceptStudentInvitationRequest,
  CreateLearnerRequest,
  UpdateLearnerRequest,
  UpdateParentProfileRequest,
} from './profiles.js';

const codesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('CreateLearnerRequest', () => {
  const valid = {
    fullName: '  Nguyễn Minh Khang ',
    gradeLevelId: 8,
    relationship: 'mother',
    acceptChildDataProcessing: true,
  };

  it('trims text and turns empty optional text into null', () => {
    const parsed = CreateLearnerRequest.parse({ ...valid, nickname: ' ', schoolName: 'THCS A' });
    expect(parsed.fullName).toBe('Nguyễn Minh Khang');
    expect(parsed.nickname).toBeNull();
    expect(parsed.schoolName).toBe('THCS A');
  });

  it('requires consent to process the child data', () => {
    const result = CreateLearnerRequest.safeParse({ ...valid, acceptChildDataProcessing: false });
    expect(codesOf(result)).toContain('must_accept_child_data');
  });

  it('rejects a commune without a province and a birth date in the future', () => {
    const result = CreateLearnerRequest.safeParse({
      ...valid,
      communeId: 12,
      dateOfBirth: '2999-01-01',
    });
    expect(codesOf(result)).toEqual(expect.arrayContaining(['province_required', 'invalid_date']));
  });
});

describe('UpdateLearnerRequest', () => {
  it('accepts null to clear a field and rejects an empty patch', () => {
    expect(UpdateLearnerRequest.parse({ schoolName: null })).toEqual({ schoolName: null });
    expect(codesOf(UpdateLearnerRequest.safeParse({}))).toContain('nothing_to_update');
  });
});

describe('UpdateParentProfileRequest', () => {
  it('fills missing fields with null (PUT replaces the profile)', () => {
    expect(UpdateParentProfileRequest.parse({ provinceId: 1 })).toEqual({
      provinceId: 1,
      communeId: null,
      addressLine: null,
    });
  });
});

describe('AcceptStudentInvitationRequest', () => {
  it('accepts a 43-character base64url token only', () => {
    const base = { password: 'matkhau123', acceptTerms: true };
    expect(
      AcceptStudentInvitationRequest.safeParse({ ...base, token: 'a'.repeat(43) }).success,
    ).toBe(true);
    expect(codesOf(AcceptStudentInvitationRequest.safeParse({ ...base, token: 'abc' }))).toContain(
      'invalid_token',
    );
  });
});
