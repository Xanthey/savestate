# ═══════════════════════════════════════════════════════════════════
#  SaveState v2 — Web Image
#  Base: trafex/php-nginx (Alpine + PHP 8.2 + Nginx)
#  App files are baked in at build time.
#  company.conf and uploads/ are bind-mounted at runtime.
# ═══════════════════════════════════════════════════════════════════

FROM trafex/php-nginx:3.4.0

USER root

# ── PHP extensions for MySQL ────────────────────────────────────────
RUN apk update && apk add --no-cache \
    php82-pdo \
    php82-pdo_mysql \
    php82-mysqli

RUN echo "extension=pdo_mysql" > /etc/php82/conf.d/50_pdo_mysql.ini \
 && echo "extension=mysqli"   > /etc/php82/conf.d/50_mysqli.ini

# ── Bake app files into the image ───────────────────────────────────
COPY ./savestate/ /var/www/html/

# ── Pre-create uploads dir so the bind mount has a clean target ──────
RUN mkdir -p /var/www/html/uploads/ticket_images \
 && chown -R nobody:nobody /var/www/html

USER nobody
