/** @type {import('next').NextConfig} */
module.exports = { reactStrictMode:true, distDir:process.env.XEROO_COUNTER_BUILD==='1'?'.counter-build':'.build', ...(process.env.XEROO_COUNTER_BUILD==='1'?{output:'standalone',typescript:{tsconfigPath:'tsconfig.counter.json'}}:{}), serverExternalPackages:['node:sqlite'] };
