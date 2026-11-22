import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// Per opcode byte, pops*4+pushes as one hex digit; '.' where no opcode lives.
// 0x00-0x07: 01146abf  0x10-0x17: 99999995  0x18-0x1f: 9995999.  0x20-0x27: 999.....
// 0x30-0x37: 04400...  0x40-0x47: 58......  0x50-0x53: 4414
const PP = '01146abf........999999959995999.999.............04400...........58..............4414';
function run(P, N) {
  const n = P.length;
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const B = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, st = 0;
  const T = (c) => [B.subarray(0, ol), c];
  for (;;) {
    if (st === 1000000) return T(10);
    if (pc < 0 || pc >= n) return T(9);
    const op = P[pc];
    const v = parseInt(PP[op], 16);
    if (Number.isNaN(v)) return T(5);
    const im = op === 1 ? 1 : op === 2 ? 4 : op >= 48 && op <= 51 ? 2 : 0;
    if (pc + im >= n) return T(9);
    st++;
    if (sp < (v >> 2)) return T(2);
    if (sp - (v >> 2) + (v & 3) > 256) return T(3);
    const nx = pc + 1 + im;
    pc = nx;
    switch (op) {
      case 0: return T(0);
      case 1: D[sp++] = (P[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = P[nx - 4] | (P[nx - 3] << 8) | (P[nx - 2] << 16) | (P[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: {
        const rel = ((P[nx - 2] | (P[nx - 1] << 8)) << 16) >> 16;
        const take = op === 0x30 || (op === 0x31) === (D[--sp] === 0);
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return T(7);
        C[cp++] = nx;
        pc = P[nx - 2] | (P[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return T(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return T(6);
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1];
        const v = D[sp - 2];
        if (a < 0 || a >= 256) return T(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return T(11);
        sp--;
        for (let i = 0; i < s.length; i++) B[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return T(11);
        B[ol++] = D[--sp] & 255;
        break;
      case 0x52:
        D[sp++] = ip < N.length ? N[ip++] : -1;
        break;
      case 0x53:
        return T(D[--sp] & 255);
      default: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return T(4); r = (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return T(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 0x15) { if (b === 0) return T(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return T(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
      }
    }
  }
}
for (const id of readdirSync(I).sort()) {
  const [out, code] = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), `${code}\n`);
}
