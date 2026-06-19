"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { importarFuenteAction } from "@/app/(dashboard)/admin/conocimiento/actions";

export function ImportarFuente() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Cancelar" : "Importar fuente externa"}
      </Button>

      {abierto && (
        <Card className="mt-3 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Importar desde URL o texto</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={async (fd) => {
                await importarFuenteAction(fd);
                setAbierto(false);
              }}
              className="space-y-2"
            >
              <Textarea
                name="fuente"
                rows={4}
                required
                placeholder={
                  "Pega una URL (https://conocer.gob.mx/...) o texto con información\n" +
                  "relevante sobre certificaciones CONOCER — la IA extraerá hasta 5 recursos."
                }
              />
              <p className="text-xs text-muted-foreground">
                Los recursos extraídos quedan como <strong>Pendiente</strong> hasta que los apruebes.
              </p>
              <Button type="submit" size="sm">Extraer e importar</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
