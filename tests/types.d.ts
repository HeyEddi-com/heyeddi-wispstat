declare module '*.sql?raw' {
  const value: string;
  export default value;
}

declare module '*.ts?raw' {
  const value: string;
  export default value;
}

declare module 'cloudflare:test' {
  export const env: import('../src/lib/types').Env;
}
