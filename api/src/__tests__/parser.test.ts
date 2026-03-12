// Mock Anthropic SDK before any imports that use it
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
    _mockCreate: mockCreate,
  };
});

// Mock logger to suppress output during tests
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import Anthropic from '@anthropic-ai/sdk';
import { extractFields } from '../extraction/parser';

// Helper to get the mocked create function
function getMockCreate() {
  const instance = (Anthropic as jest.MockedClass<typeof Anthropic>).mock.results[0]?.value as {
    messages: { create: jest.Mock };
  };
  return instance?.messages?.create as jest.Mock;
}

describe('extractFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed object for valid JSON string input', async () => {
    const input = JSON.stringify({ summary: 'Experienced automation engineer', years_experience_total: 5 });
    const result = await extractFields(input, 'BACKGROUND');
    expect(result).toEqual({ summary: 'Experienced automation engineer', years_experience_total: 5 });
  });

  it('extracts JSON from fenced ```json block', async () => {
    const input = 'Here is my background:\n```json\n{"summary": "5 years in ops", "sql_comfort": "intermediate"}\n```';
    const result = await extractFields(input, 'BACKGROUND');
    expect(result).toEqual({ summary: '5 years in ops', sql_comfort: 'intermediate' });
  });

  it('normalizes salary field when step is COMPENSATION', async () => {
    const input = JSON.stringify({
      salary: { min: 120000, max: 150000, cadence: 'yearly' },
      notes: 'Flexible',
    });
    const result = await extractFields(input, 'COMPENSATION');
    expect(result.salary).toMatchObject({
      min: 120000,
      max: 150000,
      cadence: 'yearly',
      currency: 'USD',
    });
    expect(result.notes).toBe('Flexible');
  });

  it('falls back to Claude extraction for garbage text and returns Claude response', async () => {
    // Set up mock BEFORE the module is called so the mock instance exists
    const AnthropicMock = Anthropic as jest.MockedClass<typeof Anthropic>;
    // Re-instantiate to capture the mock
    const mockMessages = { create: jest.fn() };
    AnthropicMock.mockImplementationOnce(() => ({ messages: mockMessages } as unknown as Anthropic));

    // Re-import to get fresh instance with our mock
    jest.resetModules();
    jest.mock('@anthropic-ai/sdk', () => {
      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"closing": "Thank you for the opportunity!"}' }],
      });
      return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
          messages: { create: mockCreate },
        })),
      };
    });
    jest.mock('../logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));

    const { extractFields: freshExtractFields } = await import('../extraction/parser');
    const result = await freshExtractFields('blah blah not structured at all xyz', 'CLOSE');
    // Claude returned a JSON with closing key
    expect(result).toHaveProperty('closing');
    expect(result.closing).toBe('Thank you for the opportunity!');
  });

  it('does not normalize salary field for non-COMPENSATION steps', async () => {
    const input = JSON.stringify({ salary: { min: 100000 } });
    const result = await extractFields(input, 'BACKGROUND');
    // salary is preserved as-is (not normalized into NormalizedSalary shape)
    expect(result.salary).toEqual({ min: 100000 });
  });
});
