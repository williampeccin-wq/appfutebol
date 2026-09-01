# Subir uma versão nova na faixa Alpha (teste fechado)

> Procedimento recorrente: vale para o R1 (hoje), o R2 (05/09) e o R3 (11/09).
> Notas de cada lançamento em [changelog-teste-fechado.md](changelog-teste-fechado.md).
> Contexto de por que isso importa: numa TWA o Google **não vê** deploy do PWA. Só o
> lançamento na faixa. Entre 14/08 e 30/08 ele registrou zero.

## Antes de começar

**O projeto NÃO é Bubblewrap — é um pacote do PWABuilder**, com projeto Gradle dentro.
Fica em:

```
~/Downloads/Convocados - Google Play package (1)/
├── signing.keystore          ← a chave de upload
├── signing-key-info.txt      ← senhas e alias
└── source/                   ← o projeto Gradle
    ├── app/build.gradle      ← versão e SDK ficam AQUI
    ├── gradle.properties     ← aponta a keystore e as senhas
    └── gradlew
```

Não existe `twa-manifest.json` neste projeto. A assinatura é automática: o
`app/build.gradle` lê `KEYSTORE_PATH`, `KEYSTORE_PASS`, `KEY_ALIAS` e `KEY_PASS` do
`gradle.properties`, então o build não pede senha nenhuma.

⚠️ **A pasta está em Downloads** — lugar onde se apaga coisa sem pensar. Como o
`KEYSTORE_PATH` é relativo, dá para mover a pasta inteira para um lugar seguro sem
quebrar nada. Faça uma cópia da `signing.keystore` e do `signing-key-info.txt` fora
da máquina: perder isso é perder o app.

Números deste lançamento: **versionCode 4**, **versionName 2.0.2.0**, package
`br.app.convocados` (imutável).

---

## 1. Numerar a versão

Edite `source/app/build.gradle`, no bloco `defaultConfig` (linhas ~60):

```gradle
versionCode 4
versionName "2.0.2.0"
```

O `versionCode` **tem que ser maior** que o do último enviado (3) — a Play recusa igual
ou menor. Não mexa em `targetSdkVersion 36`, `minSdkVersion 23` nem `applicationId`.

## 2. Buildar

```bash
cd ~/Downloads/"Convocados - Google Play package (1)"/source
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew bundleRelease
```

Sai em `app/build/outputs/bundle/release/` (confira o nome do arquivo — deve ser
`app-release-signed.aab`, já assinado pela configuração do projeto).

**Dois tropeços prováveis nesta máquina:**

- `ANDROID_HOME` está vazio e não existe `local.properties`. O `export` acima resolve.
- O Java instalado é o **25**, e o wrapper é Gradle 9.0. Se o build reclamar de versão
  de JDK, instale o 17 e aponte só para este build:
  `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`

## 3. CONFERIR ANTES DE SUBIR — não pule

```bash
python3 ~/Dev/appFutebol/tools/aab-info.py app/build/outputs/bundle/release/app-release-signed.aab
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

## Se o projeto sumir

Dá para gerar outro no [PWABuilder](https://www.pwabuilder.com) a partir de
`https://convocados.app.br`, mas com duas condições inegociáveis:

- Package name **exatamente** `br.app.convocados` — é imutável depois de publicado.
- Assinatura: escolher "usar minha própria chave" e apontar para a
  **`signing.keystore` existente**, com as senhas do `signing-key-info.txt`. Chave nova
  significa upload recusado e mais um pedido de reset, que leva dias.
- Confirme a impressão digital: a certa termina em `...:F5:8F:C2:E3`
  (SHA-256 completo em [[api36-play-deadline]]).
