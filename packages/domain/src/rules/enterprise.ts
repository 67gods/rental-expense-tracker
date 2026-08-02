/**
 * Enterprise grouping (brief §5.4).
 *
 * The documented-hours test is evaluated at enterprise level, not per property.
 * Two conditions pull a property out of its enterprise for the year, and
 * residential and commercial can never share one.
 */

import type { DomainEnterprise, DomainProperty, PropertyType } from '../types';

export type EnterpriseExclusionReason = 'triple_net' | 'personal_use';

export interface PropertyMembership {
  propertyId: string;
  nickname: string;
  included: boolean;
  /** Every reason that applies, not just the first one found. */
  exclusions: EnterpriseExclusionReason[];
  /** Plain-language sentences for the property record and the dashboard. */
  messages: string[];
}

const EXCLUSION_MESSAGES: Record<EnterpriseExclusionReason, string> = {
  triple_net:
    'Triple-net leased. This property sits outside the enterprise for the year, so its hours do not count toward the target.',
  personal_use:
    'Owner personal use recorded this year. This property sits outside the enterprise for the year, so its hours do not count toward the target.',
};

/**
 * Decides whether a property counts toward its enterprise this year.
 * Returns every applicable reason so the property record can show all of them.
 */
export function evaluatePropertyMembership(
  property: DomainProperty,
): PropertyMembership {
  const exclusions: EnterpriseExclusionReason[] = [];
  if (property.isTripleNet) exclusions.push('triple_net');
  if (property.hadPersonalUse) exclusions.push('personal_use');

  return {
    propertyId: property.id,
    nickname: property.nickname,
    included: exclusions.length === 0,
    exclusions,
    messages: exclusions.map((reason) => EXCLUSION_MESSAGES[reason]),
  };
}

export interface EnterpriseComposition {
  enterpriseId: string;
  includedPropertyIds: string[];
  excludedPropertyIds: string[];
  memberships: PropertyMembership[];
}

/** Splits an enterprise's properties into those in and out for the year. */
export function evaluateEnterpriseComposition(
  enterprise: Pick<DomainEnterprise, 'id'>,
  properties: readonly DomainProperty[],
): EnterpriseComposition {
  const members = properties.filter((p) => p.enterpriseId === enterprise.id);
  const memberships = members.map(evaluatePropertyMembership);

  return {
    enterpriseId: enterprise.id,
    includedPropertyIds: memberships.filter((m) => m.included).map((m) => m.propertyId),
    excludedPropertyIds: memberships.filter((m) => !m.included).map((m) => m.propertyId),
    memberships,
  };
}

export type EnterpriseViolationCode =
  | 'mixed_property_types'
  | 'property_type_mismatch'
  | 'empty_enterprise';

export interface EnterpriseViolation {
  code: EnterpriseViolationCode;
  message: string;
  propertyIds: string[];
}

/**
 * Validates that an enterprise is legal to hold the given properties.
 *
 * Residential and commercial cannot be mixed (§5.4). This runs before a
 * property is assigned or an enterprise's type is changed, so the invalid state
 * is refused rather than reported later.
 */
export function validateEnterpriseComposition(
  enterprise: Pick<DomainEnterprise, 'id' | 'name' | 'propertyType'>,
  properties: readonly (DomainProperty & { propertyType?: PropertyType })[],
): EnterpriseViolation[] {
  const members = properties.filter((p) => p.enterpriseId === enterprise.id);
  const violations: EnterpriseViolation[] = [];

  if (members.length === 0) {
    violations.push({
      code: 'empty_enterprise',
      message: `"${enterprise.name}" has no properties assigned to it.`,
      propertyIds: [],
    });
    return violations;
  }

  // A property carries its own type only when it is being moved between
  // enterprises. Anything that disagrees with the enterprise is a violation.
  const mismatched = members.filter(
    (p) => p.propertyType != null && p.propertyType !== enterprise.propertyType,
  );

  if (mismatched.length > 0) {
    violations.push({
      code: 'property_type_mismatch',
      message: `"${enterprise.name}" is a ${enterprise.propertyType} enterprise. ${mismatched
        .map((p) => p.nickname)
        .join(', ')} cannot be grouped with it. Residential and commercial properties need separate enterprises.`,
      propertyIds: mismatched.map((p) => p.id),
    });
  }

  const distinctTypes = new Set(
    members.map((p) => p.propertyType).filter((t): t is PropertyType => t != null),
  );
  if (distinctTypes.size > 1) {
    violations.push({
      code: 'mixed_property_types',
      message: `"${enterprise.name}" would contain both ${[...distinctTypes].join(' and ')} properties. They must be split into separate enterprises.`,
      propertyIds: members.map((p) => p.id),
    });
  }

  return violations;
}

/**
 * Guard used by the write path. Assigning a property to an enterprise of the
 * wrong type is refused at the service layer, not warned about afterwards.
 */
export function canAssignPropertyToEnterprise(
  propertyType: PropertyType,
  enterprise: Pick<DomainEnterprise, 'propertyType' | 'name'>,
): { allowed: boolean; message?: string } {
  if (propertyType === enterprise.propertyType) return { allowed: true };
  return {
    allowed: false,
    message: `"${enterprise.name}" holds ${enterprise.propertyType} properties. A ${propertyType} property needs its own enterprise.`,
  };
}
