<img src="https://raw.githubusercontent.com/samuelncui/yatm/main/frontend/frontend/favicon.svg" alt="YATM Logo" style="height: 100px; width:100px;"/>

# YATM — Yet Another Tape Manager

YATM es un gestor de cintas open-source pionero para cintas LTO mediante formato LTFS. Ofrece las siguientes funcionalidades:

![20230928-023325](https://github.com/samuelncui/yatm/assets/7183284/1f48dfaa-1fb5-40fd-9179-1d7dc9647f84)

![20230928-023638@](https://github.com/samuelncui/yatm/assets/7183284/913e1b38-bb7e-470f-b1cf-7f08499eded1)

- Depende de LTFS, un formato abierto para cintas LTO. ¡Ya no necesitas estar atado a un formato privado!
- Interfaz web basada en GRPC, React y [Chonky file browser](https://github.com/TimboKZ/Chonky). Incluye un gestor de archivos, creador de trabajos de backup, creador de trabajos de restauración, gestor de cintas y gestor de trabajos.
  - El gestor de archivos permite organizar tus archivos en un sistema de archivos virtual tras el backup. Desacopla las posiciones de los archivos en las cintas de sus posiciones en el sistema virtual.
  - El gestor de trabajos permite seleccionar qué unidad de cinta usar e indica qué cinta se necesita al ejecutar una restauración.
- Copia rápida con precarga de punteros de archivo, usa [ACP](https://github.com/samuelncui/acp). Optimizado para dispositivos lineales como cintas LTO.
- Orden de copia ordenado según la posición en cinta para evitar el efecto shoe-shining.
- Cifrado hardware por envoltura para cada cinta (no implementado completamente aún, se mejorará en el futuro).

## Dependencias

### Hardware

YATM necesita al menos una unidad de cinta LTO que soporte LTFS (LTO-5 o superior). Puedes ejecutar este software como gestor offline de discos duros, pero la implementación actual no soporta esta aplicación todavía (se aceptan pull requests).

Por falta de dispositivos de prueba, este software solo soporta la plataforma amd64.

### Software

YATM utiliza varios programas externos según tu hardware. Lo ideal es que tengas los binarios de los siguientes programas en el PATH, o puedes modificar los scripts en `/scripts` para que funcionen correctamente.

- Sistema Linux en plataforma amd64. Hay otros SO y arquitecturas soportadas experimentalmente (puedes descargar los binarios precompilados en `Releases`), pero no están probados. Solo lo he probado a fondo en Debian 11/12. Si tienes problemas en otras distribuciones, abre un issue. Se aceptan pull requests si puedes portarlo a BSD u otra arquitectura. Windows no está soportado porque su mecanismo de montaje es muy diferente al de los sistemas Unix.
- LTFS, para formatear y montar cintas LTO mediante LTFS. Puedes usar [OpenLTFS](https://github.com/LinearTapeFileSystem/ltfs), [HPE LTFS](https://github.com/nix-community/hpe-ltfs) o [IBM LTFS](https://www.ibm.com/docs/en/spectrum-archive-le?topic=tools-downloading-ltfs), según tu hardware de unidad de cinta. Puede que necesites cambiar el código para tu plataforma.
  - El script actual está probado con HPE LTFS. Si usas otro software LTFS, puede que necesites modificar `/scripts/mkfs` y `/scripts/mount`. Si los scripts no son adecuados para otro software LTFS, crea una pull request.
- [Stenc](https://github.com/scsitape/stenc), para gestionar el cifrado hardware en unidades de cinta LTO.

## Instalación

Puedes ejecutar el script automático de instalación para instalar/actualizar a la última versión:

```shell
bash <(curl -L https://raw.githubusercontent.com/samuelncui/yatm/main/install-release.sh)
```

O puedes descargar el binario desde `releases` y ejecutar los siguientes comandos:

```shell
# Si pones esto en otra ruta, necesitas cambiar los scripts y el archivo systemd.
mkdir -p /opt/yatm
tar -xvzf yatm-linux-amd64-${RELEASE_VERSION}.tar.gz -C /opt/yatm

cp /opt/yatm/config.example.yaml /opt/yatm/config.yaml
# cambia el archivo de configuración según tus necesidades.
vim /opt/yatm/config.yaml

systemctl enable /opt/yatm/yatm-httpd.service
systemctl start yatm-httpd.service
```

### ¡Aviso!

Cuando un trabajo de backup termina (o al menos la cinta está llena), la cinta será expulsada al desmontar por defecto. Sugiero activar el interruptor de protección contra escritura inmediatamente. Existe la posibilidad de que el driver de la cinta escriba en la partición de índice al montarla, lo que puede causar pérdida del índice. Si sabes la razón de este comportamiento extraño, por favor comunícamelo por email o issue.

## Nginx Reverse Proxy

YATM usa GRPC, que necesita HTTP2 para funcionar. Puedes usar la siguiente configuración de nginx como proxy inverso:

```nginx config
server {
    # necesita http2 para hacer proxy de grpc
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    server_name example.com;
    # si usas autenticación básica, SSL es crítico para proteger tu contraseña
    include includes/ssl.conf;

    proxy_connect_timeout 60;
    proxy_send_timeout 3600;
    proxy_read_timeout 3600;
    send_timeout 3600;
    client_max_body_size 4g;

    proxy_buffer_size 1024k;
    proxy_buffers 4 2048k;
    proxy_busy_buffers_size 2048k;

    http2_max_requests 10000000;

    location / {
        # puedes usar autenticación básica para proteger tu sitio
        auth_basic              "restringido";
        auth_basic_user_file    includes/passwd;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_forwards_for;
        proxy_pass http://127.0.0.1:8080;
    }
}
```

## Agradecimientos

- lto-info está adaptado de [https://github.com/speed47/lto-info](https://github.com/speed47/lto-info), con capacidad añadida para leer el barcode de la memoria del cartucho. ¡Gracias, @speed47!
