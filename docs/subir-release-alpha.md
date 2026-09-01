# Subir uma versão nova na faixa Alpha (teste fechado)

> Procedimento recorrente: vale para o R1 (hoje), o R2 (05/09) e o R3 (11/09).
> Notas de cada lançamento em [changelog-teste-fechado.md](changelog-teste-fechado.md).
> Contexto de por que isso importa: numa TWA o Google **não vê** deploy do PWA. Só o
> lançamento na faixa. Entre 14/08 e 30/08 ele registrou zero.

## Antes de começar

| Item | Onde |
|---|---|
| Keystore + senhas | você localizou — confirme que abre |
| Projeto TWA (pasta com `twa-manifest.json`) | ver "se o projeto sumiu", no fim |
| JDK 17 | `java -version` |
| Bubblewrap | `bubblewrap --version` · instala com `npm i -g @bubblewrap/cli` |

Números deste lançamento: **versionCode 4**, **versionName 2.0.2.0**, package
`br.app.convocados` (imutável).

---

## 1. Numerar a versão

Na pasta do projeto TWA, edite `twa-manifest.json`:

```json
"appVersionCode": 4,
"appVersionName": "2.0.2.0",
```

O `appVersionCode` **tem que ser maior** que o do último enviado (3). A Play recusa
igual ou menor. O `appVersionName` é o que aparece para gente ler.

## 2. Buildar

```bash
bubblewrap build
```

Ele pede a senha do keystore e a da chave. Sai `app-release-signed.aab` na pasta.

Se ele perguntar se quer atualizar a partir do manifest do site, pode aceitar — o
conteúdo vem de `convocados.app.br` em tempo de execução, então isso só mexe em
ícone, nome e cores.

## 3. CONFERIR ANTES DE SUBIR — não pule

```bash
python3 tools/aab-info.py app-release-signed.aab
```

Tem que sair **exatamente** isto:

```
package            br.app.convocados
versionCode        4
versionName        2.0.2.0
targetSdkVersion   36
assinado           sim (...)
```

**O `targetSdkVersion` é o campo que mata.** O arquivo `convocados-v2-api36.aab`
mirava **35** apesar do nome — o 36 dele era o `compileSdkVersion`, que o Google não
fiscaliza. Desde **31/08/2026** a Play recusa upload com target abaixo de 36.

Se sair 35, antes de mais nada:

1. `npm i -g @bubblewrap/cli` (versão velha do Bubblewrap mira mais baixo), apague a
   pasta de build e refaça; ou
2. edite `app/build.gradle` na pasta do projeto, ajuste `targetSdkVersion 36` e rode
   `bubblewrap build` de novo.

Confira de novo com o `aab-info.py`. Só suba quando aparecer 36.

## 4. Subir no Play Console

**Testar e lançar → Teste → Teste fechado → Alpha → "Criar nova versão"**

- **Não crie faixa nova.** É a Alpha que existe, com os testadores e o contador de
  14 dias correndo. Faixa nova zera tudo.
- Faça upload do `.aab`.
- Em **Notas da versão**, cole o texto do changelog (limite de **500 caracteres** por
  idioma; as notas já estão medidas).
- **Revisar versão → Iniciar lançamento para Teste fechado.**

Passa por revisão. No teste fechado costuma sair em horas, mas pode levar mais — é por
isso que o R3 fica no dia 11 e não no 13.

## 5. Confirmar

Na tela da faixa, o resumo deve mostrar **"Última versão: 4 (2.0.2.0)"**. Enquanto
disser 3, não saiu.

Subir versão **não mexe** no contador de testadores: ele conta opt-in, não lançamento.
Os testadores recebem a atualização sozinhos pela Play.

---

## Se o projeto TWA sumiu

Dá para recriar, mas com cuidado — o package e a chave **têm** que ser os mesmos:

```bash
bubblewrap init --manifest https://convocados.app.br/manifest.webmanifest
```

- Package name: `br.app.convocados` — exatamente isso, é imutável.
- Signing key: aponte para a **keystore existente**, nunca gere uma nova. Chave nova =
  a Play recusa o upload e você precisa de outro reset (que leva dias).
- Depois do init, ajuste `appVersionCode: 4` e siga do passo 2.
- Confirme a impressão digital: a chave certa é a que termina em
  `...:F5:8F:C2:E3` (SHA-256 completo em [[api36-play-deadline]]).
