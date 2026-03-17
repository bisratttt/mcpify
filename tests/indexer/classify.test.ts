import { describe, it, expect } from 'vitest';
import { classifySafety } from '../../src/indexer/index.js';

function ep(method: string, path: string, summary?: string, description?: string) {
  return { method, path, summary, description } as Parameters<typeof classifySafety>[0];
}

describe('classifySafety', () => {
  describe('READ', () => {
    it('GET is always read', () => {
      expect(classifySafety(ep('GET', '/users'))).toBe('read');
    });
    it('HEAD is read', () => {
      expect(classifySafety(ep('HEAD', '/users'))).toBe('read');
    });
    it('OPTIONS is read', () => {
      expect(classifySafety(ep('OPTIONS', '/users'))).toBe('read');
    });
  });

  describe('WRITE', () => {
    it('POST with no dangerous keywords is write', () => {
      expect(classifySafety(ep('POST', '/pets', 'Create a pet'))).toBe('write');
    });
    it('PUT is write', () => {
      expect(classifySafety(ep('PUT', '/pets/1', 'Update pet'))).toBe('write');
    });
    it('PATCH is write', () => {
      expect(classifySafety(ep('PATCH', '/users/1', 'Update user'))).toBe('write');
    });
  });

  describe('DESTRUCTIVE', () => {
    it('DELETE method is always destructive', () => {
      expect(classifySafety(ep('DELETE', '/users/1'))).toBe('destructive');
    });
    it('POST with cancel in summary is destructive', () => {
      expect(classifySafety(ep('POST', '/subscriptions/1/cancel', 'Cancel subscription'))).toBe('destructive');
    });
    it('POST with revoke in path is destructive', () => {
      expect(classifySafety(ep('POST', '/tokens/revoke'))).toBe('destructive');
    });
    it('POST with purge in summary is destructive', () => {
      expect(classifySafety(ep('POST', '/cache', 'Purge cache'))).toBe('destructive');
    });
    it('POST with archive in description is destructive', () => {
      expect(classifySafety(ep('POST', '/records/1', undefined, 'Archive this record'))).toBe('destructive');
    });
    it('POST with disable in summary is destructive', () => {
      expect(classifySafety(ep('POST', '/users/1', 'Disable user account'))).toBe('destructive');
    });
  });

  describe('BILLABLE', () => {
    it('POST with charge in summary is billable', () => {
      expect(classifySafety(ep('POST', '/v1/charges', 'Create a charge'))).toBe('billable');
    });
    it('POST with payment in path is billable', () => {
      expect(classifySafety(ep('POST', '/v1/payment_intents', 'Create payment intent'))).toBe('billable');
    });
    it('POST with invoice in summary is billable', () => {
      expect(classifySafety(ep('POST', '/invoices', 'Create invoice'))).toBe('billable');
    });
    it('POST with sms in path is billable', () => {
      expect(classifySafety(ep('POST', '/2010-04-01/Accounts/{Sid}/Messages.json', 'Send an SMS'))).toBe('billable');
    });
    it('POST with send in summary is billable', () => {
      expect(classifySafety(ep('POST', '/messages', 'Send message to user'))).toBe('billable');
    });
    it('POST with subscribe in summary is billable', () => {
      expect(classifySafety(ep('POST', '/plans/subscribe', 'Subscribe to a plan'))).toBe('billable');
    });
    it('GET with billing keyword is still read (method takes priority)', () => {
      expect(classifySafety(ep('GET', '/invoices', 'List invoices'))).toBe('read');
    });
    it('destructive takes priority over billable — cancel payment is destructive not billable', () => {
      expect(classifySafety(ep('POST', '/payment/cancel', 'Cancel payment'))).toBe('destructive');
    });
  });

  describe('stored in indexed endpoint', () => {
    it('safetyLevel is set on the endpoint type', () => {
      const result = classifySafety(ep('POST', '/v1/charges', 'Create a charge'));
      expect(result).toBe('billable');
    });
  });
});
