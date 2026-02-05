// URL del Backend Node.js Local
// Si despliegas el backend, cambia esto por la URL de producción
const API_URL = 'http://localhost:3000/api/data'; 

export const fetchData = async () => {
  try {
    // Intentar fetch a la API
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error('Error en la red');
    }
    const json = await response.json();
    return json;
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
};
