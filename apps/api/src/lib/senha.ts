import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Hash de senha com scrypt.
 *
 * Usa apenas `node:crypto` — sem dependencia nativa para compilar, o que evita
 * o atrito de bcrypt/argon2 em Windows. O scrypt e um KDF com custo de memoria,
 * adequado para senhas.
 */

// `promisify` perde a sobrecarga de 4 argumentos do scrypt; tipamos aqui.
const scryptAsync = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: ScryptOptions,
) => Promise<Buffer>;

const TAMANHO_SAL = 16;
const TAMANHO_HASH = 64;
/** Custo de CPU/memoria. 2^16 ≈ 64 MB por derivacao. */
const CUSTO = 2 ** 16;
const BLOCO = 8;
const PARALELISMO = 1;
const ALGORITMO = 'scrypt';

async function derivar(senha: string, sal: Buffer): Promise<Buffer> {
  return scryptAsync(senha.normalize('NFKC'), sal, TAMANHO_HASH, {
    N: CUSTO,
    r: BLOCO,
    p: PARALELISMO,
    // O scrypt do Node limita a memoria por padrao; o custo acima exige mais.
    maxmem: 256 * 1024 * 1024,
  });
}

/** Gera `scrypt$<sal-hex>$<hash-hex>`. */
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(TAMANHO_SAL);
  const hash = await derivar(senha, sal);
  return `${ALGORITMO}$${sal.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Confere a senha em tempo constante.
 *
 * Devolve `false` — em vez de lancar — para qualquer hash malformado: um
 * registro corrompido nao deve virar erro 500 numa tela de login.
 */
export async function conferirSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  const partes = hashArmazenado?.split('$');
  if (!partes || partes.length !== 3 || partes[0] !== ALGORITMO) return false;

  const [, salHex, hashHex] = partes;
  if (!salHex || !hashHex) return false;

  try {
    const sal = Buffer.from(salHex, 'hex');
    const esperado = Buffer.from(hashHex, 'hex');
    if (esperado.length !== TAMANHO_HASH) return false;

    const calculado = await derivar(senha, sal);
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}
