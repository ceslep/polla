# Implementación de Apuestas Obligatorias de Posiciones y Goleador

## Contexto del Proyecto
Estoy trabajando en una PWA de apuestas deportivas construida con **Svelte 5 (runes)**. El proyecto ya tiene implementados múltiples componentes, stores, y flujos de usuario. Necesito agregar una nueva funcionalidad que gestione apuestas obligatorias para campeón, subcampeón, tercer lugar y goleador del torneo.

## Flujo Requerido

### 1. Detección Post-Login
Después de que el participante inicia sesión exitosamente, el sistema debe:
- Consultar el endpoint: `https://app.iedeoccidente.com/gs/get_all_pwa_bets.php`
- Verificar si el usuario ya tiene registradas las apuestas para:
  - Campeón
  - Subcampeón
  - Tercer lugar
  - Goleador

### 2. Lógica de Navegación
**CASO A: El participante YA tiene las 4 apuestas registradas**
- Continuar normalmente con el flujo de apuestas existentes
- Las apuestas de posiciones y goleador deben aparecer como **solo lectura** (bloqueadas, sin posibilidad de edición)
- Mostrar indicador visual de que estas apuestas están fijas

**CASO B: El participante NO tiene las apuestas de posiciones/goleador**
- Después de hacer clic en "Hacer Apuestas" desde la pantalla principal, ANTES de mostrar el formulario de apuestas regulares:
  - Mostrar un **formulario obligatorio** que solicite:
    - Campeón (selector de equipos)
    - Subcampeón (selector de equipos)
    - Tercer lugar (selector de equipos)
    - Goleador (selector de jugadores)
  - El formulario debe tener validación completa (todos los campos obligatorios)
  - Al enviar, guardar estas apuestas en el backend
  - Verificar que la respuesta del backend confirme el registro exitoso de los 4 items
  - Solo después de confirmar el guardado, proceder al formulario de apuestas regulares

### 3. Restricciones Importantes
- Una vez guardadas, las apuestas de campeón, subcampeón, tercer lugar y goleador **NO se pueden modificar**
- El sistema debe validar que siempre existan estos 4 registros antes de permitir continuar con otras apuestas
- Si por alguna razón faltan algunos de estos registros, forzar al usuario a completarlos

## Requisitos Técnicos

### Integración con Código Existente
- **IMPORTANTE**: Revisa primero los archivos existentes del proyecto para entender:
  - La estructura de componentes actual
  - Los stores y estado global (especialmente el store de autenticación y apuestas)
  - Los patrones de manejo de API calls
  - El sistema de routing y navegación
  - Los componentes de formularios y validación ya implementados
  - Los estilos y sistema de diseño existente
- Basa tu implementación en los patrones y componentes ya existentes
- No introduzcas nuevas dependencias a menos que sea estrictamente necesario

### Svelte 5 Runes
- Usa `$state`, `$derived`, `$effect` según sea apropiado
- Implementa reactividad moderna de Svelte 5
- Mantén la consistencia con el resto del código que ya usa runes

### Manejo de API
- Endpoint para consultar apuestas existentes: `https://app.iedeoccidente.com/gs/get_all_pwa_bets.php`
- Necesitaré el endpoint para guardar las nuevas apuestas de posiciones/goleador (proporcióname la estructura esperada o usa el patrón existente de guardado de apuestas)
- Manejo apropiado de estados de carga, errores y respuestas exitosas
- Incluir autenticación en las llamadas API (tokens, headers, etc. según el patrón existente)

### UX/UI Moderna
- Diseño limpio y minimalista, consistente con el resto de la aplicación
- Formularios intuitivos con validación en tiempo real
- Feedback visual claro durante el proceso:
  - Estados de carga (spinners, skeletons)
  - Mensajes de éxito/error
  - Confirmaciones visuales
- Navegación fluida entre el formulario de posiciones y el de apuestas regulares
- Indicadores visuales claros cuando las apuestas están bloqueadas
- Responsive design (mobile-first si es una PWA)
- Accesibilidad (labels apropiados, navegación por teclado, ARIA donde sea necesario)

## Estructura de Archivos Sugerida
Basándote en la estructura existente del proyecto, crea/modifica los archivos necesarios. Sugiero:
- Componente para el formulario de posiciones obligatorias
- Lógica de detección (probablemente en un store o hook)
- Integración con la pantalla principal y el flujo de apuestas
- Componente para mostrar apuestas bloqueadas (solo lectura)

## Criterios de Aceptación
1. ✅ Después del login, se detecta automáticamente si el usuario tiene las 4 apuestas
2. ✅ Si no las tiene, se muestra el formulario obligatorio antes de las apuestas regulares
3. ✅ El formulario valida que todos los campos estén completos
4. ✅ Las apuestas se guardan correctamente en el backend
5. ✅ Se verifica que los 4 items quedaron registrados
6. ✅ Una vez guardadas, las apuestas aparecen bloqueadas en toda la aplicación
7. ✅ El usuario no puede editar estas apuestas después de guardarlas
8. ✅ La UX es fluida y el feedback es claro
9. ✅ El código sigue los patrones existentes del proyecto
10. ✅ No hay regresiones en la funcionalidad existente

## Instrucciones para la Implementación
1. Primero, analiza los archivos existentes del proyecto para entender la arquitectura
2. Proporcióname un plan de implementación antes de escribir código
3. Implementa siguiendo los patrones existentes
4. Explica las decisiones de diseño y arquitectura que tomes
5. Si necesitas endpoints adicionales o información del backend, indícamelo claramente
6. Incluye comentarios en el código donde sea necesario para explicar la lógica compleja

---

**Nota**: El proyecto ya está funcional con múltiples características implementadas. Tu objetivo es agregar esta nueva funcionalidad de la manera más integrada y consistente posible con el código existente.