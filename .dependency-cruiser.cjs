/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "module-internals-private",
      severity: "error",
      comment: "Kode di luar modules/ hanya boleh mengimpor lewat index.ts (ADR-0008).",
      from: { pathNot: "^apps/api/src/modules/" },
      to: {
        path: "^apps/api/src/modules/[^/]+/.+",
        pathNot: "^apps/api/src/modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "module-no-cross-internals",
      severity: "error",
      comment: "Modul tidak boleh menembus ke dalam modul lain.",
      from: { path: "^apps/api/src/modules/([^/]+)/" },
      to: {
        path: "^apps/api/src/modules/[^/]+/.+",
        pathNot: [
          "^apps/api/src/modules/$1/",
          "^apps/api/src/modules/[^/]+/index\\.ts$",
        ],
      },
    },
    {
      name: "platform-no-modules",
      severity: "error",
      comment: "platform/ tidak boleh bergantung ke modul domain.",
      from: { path: "^apps/api/src/platform/" },
      to: { path: "^apps/api/src/modules/" },
    },
    {
      name: "no-import-entry",
      severity: "error",
      comment: "Modul tidak boleh mengimpor composition root.",
      from: { path: "^apps/api/src/modules/" },
      to: { path: "^apps/api/src/(main|app)\\.ts$" },
    },
    {
      name: "repository-no-upper-layers",
      severity: "error",
      from: { path: "\\.repository\\.ts$" },
      to: { path: "\\.(service|routes)\\.ts$" },
    },
    {
      name: "service-no-routes",
      severity: "error",
      from: { path: "\\.service\\.ts$" },
      to: { path: "\\.routes\\.ts$" },
    },
    {
      name: "shared-no-apps",
      severity: "error",
      from: { path: "^packages/shared/" },
      to: { path: "^apps/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    reporterOptions: { dot: { collapsePattern: "node_modules/[^/]+" } },
  },
};
