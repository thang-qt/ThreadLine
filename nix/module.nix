flake: {
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.threadline;
in {
  options.services.threadline = {
    enable = lib.mkEnableOption "Threadline community news reader";
    package = lib.mkOption {
      type = lib.types.package;
      default = flake.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "threadline.packages.\${pkgs.stdenv.hostPlatform.system}.default";
      description = "Threadline package to run.";
    };
    address = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1:8080";
      description = "HTTP listen address. Put a reverse proxy in front for public access.";
    };
    discussionProviders = lib.mkOption {
      type = lib.types.listOf (lib.types.enum ["html" "firebase" "algolia"]);
      default = ["html" "firebase" "algolia"];
      description = "Ordered Hacker News discussion providers. At least one is required.";
    };
    contact = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "https://example.org/contact";
      description = "Public operator email or URL included in upstream User-Agent headers.";
    };
  };
  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.discussionProviders != [];
        message = "services.threadline.discussionProviders must contain at least one provider.";
      }
    ];
    systemd.services.threadline = {
      description = "Threadline community news reader";
      wantedBy = ["multi-user.target"];
      wants = ["network-online.target"];
      after = ["network-online.target"];
      environment =
        {
          ADDR = cfg.address;
          HN_DISCUSSION_PROVIDERS = lib.concatStringsSep "," cfg.discussionProviders;
        }
        // lib.optionalAttrs (cfg.contact != null) {
          THREADLINE_CONTACT = cfg.contact;
        };
      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        DynamicUser = true;
        Restart = "on-failure";
        RestartSec = "5s";
        TimeoutStopSec = "10s";
        NoNewPrivileges = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        ProtectClock = true;
        RestrictSUIDSGID = true;
        RestrictRealtime = true;
        LockPersonality = true;
        MemoryDenyWriteExecute = true;
        CapabilityBoundingSet = "";
        RestrictAddressFamilies = ["AF_UNIX" "AF_INET" "AF_INET6"];
        SystemCallArchitectures = "native";
        SystemCallFilter = ["@system-service" "~@privileged" "~@resources"];
        UMask = "0077";
      };
    };
  };
}
