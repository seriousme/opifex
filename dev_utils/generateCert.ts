import forge from "node-forge";

/**
 * Generates a minimal, in-memory TLS certificate bundle for localhost development.
 * Includes Root CA, Server Certificate, and Server Private Key with SAN support (IPv4 & IPv6).
 */
export function generateLocalhostCerts(): {
  caCert: string;
  key: string;
  cert: string;
  fullChain: string;
} {
  // Generate the keypairs
  // 2048-bit RSA is used here for fast generation during local development/testing
  const caKeys = forge.pki.rsa.generateKeyPair(2048);
  const serverKeys = forge.pki.rsa.generateKeyPair(2048);

  // Create root CA
  const caCert = forge.pki.createCertificate();
  caCert.publicKey = caKeys.publicKey;
  caCert.serialNumber = "01";
  caCert.validity.notBefore = new Date();
  caCert.validity.notAfter = new Date();
  caCert.validity.notAfter.setFullYear(
    caCert.validity.notBefore.getFullYear() + 1,
  ); // Valid for 1 year

  // Hardcoded CA Attributes
  const caAttrs = [{ name: "commonName", value: "Local Dev Root CA" }];
  caCert.setSubject(caAttrs);
  caCert.setIssuer(caAttrs); // Self-signed: issuer equals subject

  // Critical for CA: Define basic constraints to flag this certificate as a trusted issuer
  caCert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      critical: true,
    },
  ]);

  // Sign the CA certificate using its own private key
  caCert.sign(caKeys.privateKey, forge.md.sha256.create());

  // Create server certificate for localhost, valid for a year
  const serverCert = forge.pki.createCertificate();
  serverCert.publicKey = serverKeys.publicKey;
  serverCert.serialNumber = "02"; // Unique serial number within this CA scope
  serverCert.validity.notBefore = new Date();
  serverCert.validity.notAfter = new Date();
  serverCert.validity.notAfter.setFullYear(
    serverCert.validity.notBefore.getFullYear() + 1,
  );

  // Hardcoded Server Attributes
  serverCert.setSubject([{ name: "commonName", value: "localhost" }]);
  serverCert.setIssuer(caCert.subject.attributes); // Issued by our custom Root CA

  // Critical for Modern TLS: X509v3 Extensions containing Subject Alternative Names (SAN)
  // Ensures compatibility with strict TLS parsers (like Deno/rustls, Go, Node.js, and modern browsers)
  serverCert.setExtensions([
    { name: "basicConstraints", cA: false, critical: true },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" }, // type 2 = DNS
        { type: 7, ip: "127.0.0.1" }, // type 7 = IPv4 loopback
        { type: 7, ip: "::1" }, // type 7 = IPv6 loopback
      ],
    },
  ]);

  // Sign the server certificate using the Root CA's private key
  serverCert.sign(caKeys.privateKey, forge.md.sha256.create());

  // convert data to PEM
  const caCertPem = forge.pki.certificateToPem(caCert);
  const serverCertPem = forge.pki.certificateToPem(serverCert);
  const serverKeyPem = forge.pki.privateKeyToPem(serverKeys.privateKey);

  return {
    caCert: caCertPem,
    key: serverKeyPem,
    cert: serverCertPem,
    fullChain: `${serverCertPem}\n${caCertPem}`, // Full certificate chain (Server + CA)
  };
}
