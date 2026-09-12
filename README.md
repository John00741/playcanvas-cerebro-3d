# Cérebro 3D — PlayCanvas

Ambiente 3D navegável dentro de um cérebro gigante e oco, usando um modelo
3D real (não geometria procedural — uma primeira tentativa com esfera
deformada por senos/cossenos não convenceu como "cérebro").

Um único script (`scripts/cerebro-3d.js`) faz tudo: carrega o modelo,
escala para um tamanho gigante, torna o material visível por dentro (sem
cull + iluminação de dois lados) e implementa controles de voo em primeira
pessoa (WASD + mouse, Espaço/Shift para subir/descer).

Anexar o script à entidade **Câmera** de um projeto em branco no editor do
PlayCanvas, com o asset `brain.glb` importado no projeto — nenhuma outra
configuração de cena é necessária.

## Créditos

Modelo 3D "Brain" por **Poly by Google**, via [Poly Pizza](https://poly.pizza/m/5mPRPZkI3qt),
licença **CC BY 3.0** (atribuição obrigatória).
