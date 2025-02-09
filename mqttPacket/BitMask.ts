/**
 * Object containing bit mask values from 2^0 to 2^7
 * @constant
 * @type {Record<string,number>}
 * @property {number} bit0 - Represents 2^0 = 1
 * @property {number} bit1 - Represents 2^1 = 2
 * @property {number} bit2 - Represents 2^2 = 4
 * @property {number} bit3 - Represents 2^3 = 8
 * @property {number} bit4 - Represents 2^4 = 16
 * @property {number} bit5 - Represents 2^5 = 32
 * @property {number} bit6 - Represents 2^6 = 64
 * @property {number} bit7 - Represents 2^7 = 128
 */
export const BitMask: Record<string, number> = {
  bit0: 2 ** 0,
  bit1: 2 ** 1,
  bit2: 2 ** 2,
  bit3: 2 ** 3,
  bit4: 2 ** 4,
  bit5: 2 ** 5,
  bit6: 2 ** 6,
  bit7: 2 ** 7,
} as const;
