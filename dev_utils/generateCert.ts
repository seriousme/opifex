/**
 * Generates a minimal TLS certificate bundle for localhost using Web Crypto API.
 * Uses 0 external dependencies (pure JS ASN.1 DER encoding).
 * Do NOT use this in a production setting
 */
export async function generateLocalhostCerts(): Promise<{
  caCert: string;
  key: string;
  cert: string;
  fullChain: string;
}> {
  const algorithm: RsaHashedKeyGenParams = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  };

  // 1. Generate Keypairs using Web Crypto
  const caKeys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const serverKeys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);

  const now = new Date();
  const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  // 2. Generate Root CA Certificate (Self-signed)
  const caCertDer = await createX509Cert({
    serialNumber: 1,
    subjectCN: "Local Dev Root CA",
    issuerCN: "Local Dev Root CA",
    notBefore: now,
    notAfter: nextYear,
    publicKey: caKeys.publicKey,
    signingPrivateKey: caKeys.privateKey,
    isCA: true,
  });

  // 3. Generate Server Certificate (Signed by Root CA)
  const serverCertDer = await createX509Cert({
    serialNumber: 2,
    subjectCN: "localhost",
    issuerCN: "Local Dev Root CA",
    notBefore: now,
    notAfter: nextYear,
    publicKey: serverKeys.publicKey,
    signingPrivateKey: caKeys.privateKey,
    isCA: false,
    sans: [
      { type: "dns", value: "localhost" },
      { type: "ip", value: "127.0.0.1" },
      { type: "ip", value: "::1" },
    ],
  });

  // Export Server Private Key to PKCS#8 PEM
  const exportedPrivateKey = await crypto.subtle.exportKey("pkcs8", serverKeys.privateKey);
  const serverKeyPem = pemEncode(exportedPrivateKey, "PRIVATE KEY");
  const caCertPem = pemEncode(caCertDer, "CERTIFICATE");
  const serverCertPem = pemEncode(serverCertDer, "CERTIFICATE");

  return {
    caCert: caCertPem,
    key: serverKeyPem,
    cert: serverCertPem,
    fullChain: `${serverCertPem}\n${caCertPem}`,
  };
}

/* ====================================================================
   Pure ASN.1 / DER Encoders (Zero-Dependency X.509 Construction)
   ==================================================================== */

interface CertOptions {
  serialNumber: number;
  subjectCN: string;
  issuerCN: string;
  notBefore: Date;
  notAfter: Date;
  publicKey: CryptoKey;
  signingPrivateKey: CryptoKey;
  isCA: boolean;
  sans?: Array<{ type: "dns" | "ip"; value: string }>;
}

async function createX509Cert(opts: CertOptions): Promise<ArrayBuffer> {
  const spkiBuffer = await crypto.subtle.exportKey("spki", opts.publicKey);

  // Building Extensions
  const extensionsList: Uint8Array[] = [];

  // Basic Constraints
  const basicConstraintsValue = derSequence([
    ...(opts.isCA ? [derBoolean(true)] : []),
  ]);
  extensionsList.push(
    derSequence([
      derOid("2.5.29.19"), // id-ce-basicConstraints
      derBoolean(true),    // Critical
      derOctetString(basicConstraintsValue),
    ])
  );

  // Key Usage
  // CA: keyCertSign (0x04) | digitalSignature (0x80) -> 0x84
  // Server: digitalSignature (0x80) | keyEncipherment (0x20) -> 0xa0
  const usageBits = opts.isCA ? new Uint8Array([0x04, 0x84]) : new Uint8Array([0x03, 0xa0]);
  extensionsList.push(
    derSequence([
      derOid("2.5.29.15"), // id-ce-keyUsage
      derBoolean(true),    // Critical
      derOctetString(derBitString(usageBits)),
    ])
  );

  // Subject Alternative Names (SAN)
  if (opts.sans && opts.sans.length > 0) {
    const sanEntries: Uint8Array[] = opts.sans.map((san) => {
      if (san.type === "dns") {
        return derTag(0x82, new TextEncoder().encode(san.value)); // dNSName [2]
      } else {
        // IP Address [7]
        const ipParts = san.value.includes(":")
          ? parseIPv6(san.value)
          : san.value.split(".").map((v) => parseInt(v, 10));
        return derTag(0x87, new Uint8Array(ipParts));
      }
    });

    const sanValue = derSequence(sanEntries);
    extensionsList.push(
      derSequence([
        derOid("2.5.29.17"), // id-ce-subjectAltName
        derOctetString(sanValue),
      ])
    );
  }

  const extensionsContainer = derTag(0xa3, derSequence(extensionsList));

  // TBSCertificate (To Be Signed)
  const tbsCert = derSequence([
    derTag(0xa0, derInteger(2)), // Version v3 (2)
    derInteger(opts.serialNumber),
    derSequence([derOid("1.2.840.113549.1.1.11")]), // sha256WithRSAEncryption
    derSequence([derSet([derSequence([derOid("2.5.4.3"), derUtf8String(opts.issuerCN)])])]),
    derSequence([derUTCTime(opts.notBefore), derUTCTime(opts.notAfter)]),
    derSequence([derSet([derSequence([derOid("2.5.4.3"), derUtf8String(opts.subjectCN)])])]),
    new Uint8Array(spkiBuffer),
    extensionsContainer,
  ]);

  // Sign TBSCertificate with RSASSA-PKCS1-v1_5 SHA-256
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    opts.signingPrivateKey,
    tbsCert as unknown as ArrayBuffer
  );

  // Final X.509 Certificate
  return derSequence([
    tbsCert,
    derSequence([derOid("1.2.840.113549.1.1.11")]),
    derBitString(new Uint8Array(signature)),
  ]).buffer as ArrayBuffer;
}

/* --- DER Primitive Encoding Helpers --- */

function concatBuffers(bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((sum, b) => sum + b.length, 0);
  const res = new Uint8Array(new ArrayBuffer(total)); 
  let offset = 0;
  for (const b of bufs) {
    res.set(b, offset);
    offset += b.length;
  }
  return res;
}

function derTag(tag: number, payload: Uint8Array): Uint8Array {
  const len = payload.length;
  let lenBytes: Uint8Array;
  if (len < 128) {
    lenBytes = new Uint8Array([len]);
  } else if (len < 256) {
    lenBytes = new Uint8Array([0x81, len]);
  } else {
    lenBytes = new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  }
  return concatBuffers([new Uint8Array([tag]), lenBytes, payload]);
}

function derSequence(items: Uint8Array[]): Uint8Array {
  return derTag(0x30, concatBuffers(items));
}

function derSet(items: Uint8Array[]): Uint8Array {
  return derTag(0x31, concatBuffers(items));
}

function derBoolean(val: boolean): Uint8Array {
  return derTag(0x01, new Uint8Array([val ? 0xff : 0x00]));
}

function derInteger(val: number): Uint8Array {
  return derTag(0x02, new Uint8Array([val]));
}

function derOctetString(val: Uint8Array): Uint8Array {
  return derTag(0x04, val);
}

function derUtf8String(val: string): Uint8Array {
  return derTag(0x0c, new TextEncoder().encode(val));
}

function derOid(oidStr: string): Uint8Array {
  const parts = oidStr.split(".").map((v) => parseInt(v, 10));
  const bytes = [parts[0]! * 40 + parts[1]!];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i] || 0;
    const stack: number[] = [];
    stack.push(v & 0x7f);
    while ((v >>= 7) > 0) {
      stack.push((v & 0x7f) | 0x80);
    }
    bytes.push(...stack.reverse());
  }
  return derTag(0x06, new Uint8Array(bytes));
}

function derBitString(val: Uint8Array): Uint8Array {
  return derTag(0x03, concatBuffers([new Uint8Array([0x00]), val]));
}

function derUTCTime(date: Date): Uint8Array {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const str =
    date.getUTCFullYear().toString().slice(-2) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z";
  return derTag(0x17, new TextEncoder().encode(str));
}

function parseIPv6(ip: string): number[] {
  const parts = ip.split("::");
  const head = parts[0] ? parts[0].split(":").map((h) => parseInt(h, 16)) : [];
  const tail = parts[1] ? parts[1].split(":").map((h) => parseInt(h, 16)) : [];
  const missing = 8 - (head.length + tail.length);
  const words = [...head, ...Array(missing).fill(0), ...tail];
  const bytes: number[] = [];
  for (const w of words) {
    bytes.push((w >> 8) & 0xff, w & 0xff);
  }
  return bytes;
}

function pemEncode(buffer: ArrayBuffer, label: string): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}