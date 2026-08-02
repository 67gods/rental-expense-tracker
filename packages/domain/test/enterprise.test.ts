import { describe, expect, it } from 'vitest';
import {
  canAssignPropertyToEnterprise,
  evaluateEnterpriseComposition,
  evaluatePropertyMembership,
  validateEnterpriseComposition,
} from '../src/rules/enterprise';
import type { DomainProperty } from '../src/types';

const property = (over: Partial<DomainProperty> = {}): DomainProperty => ({
  id: 'prop-1',
  enterpriseId: 'ent-1',
  nickname: 'Maple St',
  unadjustedBasisCents: 20_000_000,
  ownershipPct: 100,
  isTripleNet: false,
  hadPersonalUse: false,
  ...over,
});

describe('§5.4 conditions that remove a property from its enterprise', () => {
  it('includes an ordinary property', () => {
    const membership = evaluatePropertyMembership(property());
    expect(membership.included).toBe(true);
    expect(membership.exclusions).toEqual([]);
    expect(membership.messages).toEqual([]);
  });

  it('excludes a triple-net leased property', () => {
    const membership = evaluatePropertyMembership(property({ isTripleNet: true }));
    expect(membership.included).toBe(false);
    expect(membership.exclusions).toEqual(['triple_net']);
    expect(membership.messages[0]).toMatch(/triple-net/i);
  });

  it('excludes a property with owner personal use during the year', () => {
    const membership = evaluatePropertyMembership(property({ hadPersonalUse: true }));
    expect(membership.included).toBe(false);
    expect(membership.exclusions).toEqual(['personal_use']);
  });

  it('reports both reasons when both apply rather than stopping at the first', () => {
    const membership = evaluatePropertyMembership(
      property({ isTripleNet: true, hadPersonalUse: true }),
    );
    expect(membership.exclusions).toEqual(['triple_net', 'personal_use']);
    expect(membership.messages).toHaveLength(2);
  });
});

describe('§5.4 enterprise composition', () => {
  const enterprise = { id: 'ent-1', name: 'Residential', propertyType: 'residential' as const };

  it('splits members into included and excluded for the year', () => {
    const composition = evaluateEnterpriseComposition(enterprise, [
      property({ id: 'a' }),
      property({ id: 'b' }),
      property({ id: 'c', isTripleNet: true }),
      property({ id: 'd', hadPersonalUse: true }),
      property({ id: 'e' }),
    ]);

    expect(composition.includedPropertyIds).toEqual(['a', 'b', 'e']);
    expect(composition.excludedPropertyIds).toEqual(['c', 'd']);
    expect(composition.memberships).toHaveLength(5);
  });

  it('ignores properties belonging to a different enterprise', () => {
    const composition = evaluateEnterpriseComposition(enterprise, [
      property({ id: 'a' }),
      property({ id: 'other', enterpriseId: 'ent-2' }),
    ]);
    expect(composition.memberships.map((m) => m.propertyId)).toEqual(['a']);
  });

  it('defaults five ordinary properties into one enterprise with all included', () => {
    // The stated default in §5.4: all five properties in one residential enterprise.
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => property({ id }));
    const composition = evaluateEnterpriseComposition(enterprise, five);
    expect(composition.includedPropertyIds).toHaveLength(5);
    expect(composition.excludedPropertyIds).toHaveLength(0);
  });
});

describe('§5.4 residential and commercial cannot be mixed', () => {
  const residential = { id: 'ent-1', name: 'Residential', propertyType: 'residential' as const };

  it('accepts an enterprise whose properties all match its type', () => {
    const violations = validateEnterpriseComposition(residential, [
      { ...property({ id: 'a' }), propertyType: 'residential' as const },
      { ...property({ id: 'b' }), propertyType: 'residential' as const },
    ]);
    expect(violations).toEqual([]);
  });

  it('rejects a commercial property inside a residential enterprise', () => {
    const violations = validateEnterpriseComposition(residential, [
      { ...property({ id: 'a' }), propertyType: 'residential' as const },
      { ...property({ id: 'b', nickname: 'Strip mall' }), propertyType: 'commercial' as const },
    ]);

    const codes = violations.map((v) => v.code);
    expect(codes).toContain('property_type_mismatch');
    expect(codes).toContain('mixed_property_types');
    expect(violations[0]?.message).toMatch(/Strip mall/);
  });

  it('reports an enterprise with nothing assigned to it', () => {
    const violations = validateEnterpriseComposition(residential, []);
    expect(violations.map((v) => v.code)).toEqual(['empty_enterprise']);
  });

  it('blocks the assignment at the write path, not just after the fact', () => {
    expect(canAssignPropertyToEnterprise('residential', residential).allowed).toBe(true);

    const blocked = canAssignPropertyToEnterprise('commercial', residential);
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toMatch(/own enterprise/i);
  });
});
