# Cérebro 3D — PlayCanvas

Ambiente 3D navegável dentro de um cérebro gigante e oco: a malha é gerada
proceduralmente em código (esfera deformada por camadas de seno/cosseno
simulando dobras corticais), sem nenhum modelo 3D externo.

Um único script (`scripts/cerebro-3d.js`) faz tudo: constrói a casca do
cérebro, posiciona luzes, e implementa controles de voo em primeira pessoa
(WASD + mouse, Espaço/Shift para subir/descer) para explorar o interior.

Anexar o script à entidade **Câmera** de um projeto em branco no editor do
PlayCanvas — nenhuma outra configuração de cena é necessária.
