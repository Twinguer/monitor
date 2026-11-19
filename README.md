# Nomeia AI - stack de monitoramento

Stack Docker Compose com Zabbix, agente do host, coletor de presenca da aplicacao, PostgreSQL e Grafana.

## Configuracao

1. Copie `.env.example` para `.env` e troque todos os valores CHANGE_ME.
2. Defina SERVER_LAN_IP para o IP da rede local no qual Zabbix e Grafana devem escutar.
3. Calcule DOCKER_SOCK_GID no Linux com `stat -c '%g' /var/run/docker.sock`.
4. Copie `presence-monitor/presence.env.example` para `presence-monitor/presence.env` e configure URLs e chaves de servico PRD/HML.
5. O arquivo privado `nomeia-hml-postgresql.conf` e exigido pelo Compose para a configuracao do plugin PostgreSQL HML. Obtenha-o por canal seguro; ele nao esta neste repositorio.
6. Restrinja permissoes dos arquivos de ambiente: `chmod 600 .env presence-monitor/presence.env`.

Nunca envie arquivos .env, chaves Supabase, senhas ou dumps para o Git.

## Subir a stack

```sh
docker compose config --quiet
docker compose up -d
docker compose ps
```

Volumes persistentes: `zabbix_db` e `grafana_data`.

## Acesso

- Zabbix: `http://SERVER_LAN_IP:8082`
- Grafana: `http://SERVER_LAN_IP:3000`
- O listener Zabbix Server na porta 10051 fica limitado a 127.0.0.1.

O usuario administrador do Grafana e `admin`; a senha e definida por GRAFANA_ADMIN_PASSWORD.

## Monitoramento do Grafana no Zabbix

No ambiente Nomeia AI atual existe o host `Grafana - Local`, grupo `Applications`, cenario HTTP `Grafana availability` (consulta /api/health a cada minuto; espera HTTP 200) e trigger `Grafana indisponivel` de severidade alta.

Esses objetos estao no banco do Zabbix e nao sao criados automaticamente por este Compose. O banco/volume Zabbix nao esta incluído neste repositorio.
