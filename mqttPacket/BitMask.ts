/**
 * Object containing bit mask values from 2^0 to 2^7
 * @readonly
 * @enum {number}
 */
export const BitMask = {
  bit0: 2 ** 0, // 1
  bit1: 2 ** 1, // 2
  bit2: 2 ** 2, // 4
  bit3: 2 ** 3, // 8
  bit4: 2 ** 4, // 16
  bit5: 2 ** 5, // 32
  bit6: 2 ** 6, // 64
  bit7: 2 ** 7, // 128
} as const;
