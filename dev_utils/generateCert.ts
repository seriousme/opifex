import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

// helper function that calls openssl to generate a server key, a server cert, signed by a CA.
export function generateSelfSignedCert(): {
  key: string;
  cert: string;
} {
  const command =
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout /dev/stdout -out /dev/stdout -days 1 -subj "/CN=localhost"`;

  // execute the command and capture the output
  const output = execSync(command, { stdio: "pipe" }).toString();

  // fetch the components we need from the output
  const keyMatch = output.match(
    /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/,
  );
  const certMatch = output.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/,
  );

  if (!keyMatch || !certMatch) {
    throw new Error("Failed to generate certificates using system OpenSSL.");
  }
  const key = keyMatch[0];
  const cert = certMatch[0];

  return {
    key,
    cert,
  };
}



// helper function that calls openssl to generate a server key, a server cert, signed by a CA.
export async function generateCaSignedCert(): Promise<
  { key: string; cert: string; caCert: string }
> {
  // the "await using" will cleanup the tempdir as soon as it goes out of scope
  await using disposableDir = await fs.mkdtempDisposable(
    path.join(import.meta.dirname || ".", "tls-test-"),
  );
  const tmpDir = disposableDir.path;
  const caKeyFile = path.join(tmpDir, "ca.key");
  const caCertFile = path.join(tmpDir, "ca.crt");
  const serverKeyFile = path.join(tmpDir, "server.key");
  const serverCsrFile = path.join(tmpDir, "server.csr");
  const serverCertFile = path.join(tmpDir, "server.crt");
  const extFile = path.join(tmpDir, "cert.ext");
  await fs.writeFile(
    extFile,
    `
   subjectAltName=DNS:localhost,IP:127.0.0.1
   basicConstraints=CA:FALSE
   keyUsage=digitalSignature,keyEncipherment
   `.trim(),
    "utf-8",
  );

  // Generate the CA (private Key + certificate)
  execSync(`openssl genrsa -out ${caKeyFile} 2048`);
  execSync(
    `openssl req -x509 -new -nodes -key ${caKeyFile} -days 1 -subj "/CN=TestCA" -out ${caCertFile}`,
  );

  // Generate server key and certificate signing request
  execSync(`openssl genrsa -out ${serverKeyFile} 2048`);
  execSync(
    `openssl req -new -key ${serverKeyFile} -subj "/CN=localhost" -out ${serverCsrFile}`,
  );

  // Let the CA sign the server key
  execSync(
    `openssl x509 -req -in ${serverCsrFile} -CA ${caCertFile} -CAkey ${caKeyFile} -CAcreateserial -extfile ${extFile} -out ${serverCertFile} -days 1 2>/dev/null`,
  );

  // read the results that we need
  const key = await fs.readFile(serverKeyFile, "utf-8");
  const cert = await fs.readFile(serverCertFile, "utf-8");
  const caCert = await fs.readFile(caCertFile, "utf-8");
  return { key, cert, caCert };
}
