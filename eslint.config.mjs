import next from 'eslint-config-next/core-web-vitals';
export default [...next,{ignores:['.build/**','.next/**','node_modules/**']},{rules:{'react/no-unescaped-entities':'off','@next/next/no-html-link-for-pages':'off','react-hooks/set-state-in-effect':'off','react-hooks/refs':'off','react-hooks/purity':'off'}}];
