const WEI_PER_ETHER = 10n ** 18n;

/** Formats wei as a decimal ether string, trimmed to at most 6 fractional digits. */
export function formatEther(wei: bigint): string {
  const negative = wei < 0n;
  const absolute = negative ? -wei : wei;
  const whole = absolute / WEI_PER_ETHER;
  const fraction = absolute % WEI_PER_ETHER;

  if (fraction === 0n) {
    return `${negative ? '-' : ''}${whole.toString()}`;
  }

  const fractionDigits = fraction.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}.${fractionDigits}`;
}

export function parseEther(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid ether amount: "${value}".`);
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const paddedFraction = fraction.padEnd(18, '0').slice(0, 18);
  return BigInt(whole!) * WEI_PER_ETHER + BigInt(paddedFraction || '0');
}

export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) {
    return address;
  }
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
