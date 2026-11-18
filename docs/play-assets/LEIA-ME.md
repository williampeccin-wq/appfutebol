# Artes da ficha da Play Store

| Arquivo | Para quê |
|---|---|
| `1-home.png` … `6-financeiro.png` | capturas do telefone, 1125×2000 (9:16), PNG |
| `../../appfutebol_run/img/icon-512.png` | ícone hi-res 512×512 |
| `../../appfutebol_run/img/play-feature-graphic.png` | feature graphic 1024×500 |

As capturas foram geradas por `scripts/capturar-telas-loja.mjs`, que abre o
`convocados.app.br` num Chrome sem interface, entra com a credencial do revisor,
percorre as abas e salva cada tela. Para refazer:

```
CONV_TEL=<telefone> CONV_PWD=<senha> node scripts/capturar-telas-loja.mjs home weekly_game carne championship players finance
```

Sem argumentos ele captura as seis. O recorte final para 1125×2000 é
`magick <arquivo> -gravity north -crop 1125x2000+0+0 +repage <saída>`.

## Privacidade

O clube de demonstração (Nova Resenha FC, no `convocados-prod`) foi anonimizado em
18/11/2026 por `supabase/ADHOC_anonimiza_clube_demo.sql`: nome fictício em todos os
jogadores, `photo_url` e `photoDataUrl` removidos.

Isso não é só por causa das capturas — a ficha da loja é página pública e indexada,
e **o revisor do Google entra nesse mesmo clube** com a credencial declarada. Antes
da limpeza havia nome completo e foto de rosto de gente real nas duas pontas.

Se um dia alguém repovoar o clube com dados reais, refazer a anonimização antes de
capturar de novo.
