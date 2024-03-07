---
date: 2021-03-14
spot: 宝安图书馆
sort: Computer Science
tags:
  - TCP
  - Linux
  - NAT
  - Network
  - sysctl
draft: true
---

# 译：在忙碌的 Linux 服务器上如何处理 TCP TIME-WAIT

这篇文章是我在处理一个困扰我们很久的故障时通过 Google “偶然”找到的，然后它真的把问题解决了。

## 前情提要

说“偶然”是因为我一开始搜索时用的关键字 `tcp_tw_reuse` 并不能解决问题，只是恰好它和这篇文章有关联。

前面提到的故障是指：**使用浏览器访问我们的某个 Web 平台时，会小概率出现浏览器一直转的情况，在等待数十秒之后才能正常加载页面。**

这个故障从有人向我提出到被解决，历时应该超过一年，因为它：

- 出现频率较低；
- 没有规律，无法稳定复现；
- 不属于致命性故障，加上人力有限，只能采取长期追踪逐步缩小排查范围的策略。

由于它出现频率实在是太低，当别人遇到再向我反馈时，往往已经错失了 debug 窗口。于是，我把别人反馈的信息与自己遇到此故障时所作的观察都记录在项目的 Redmind 里，得到以下一些初步结论：

1. 故障出现时，其他设备访问此 Web 平台是正常的；
2. 故障出现时，浏览器所在设备 `ping` 此 Web 平台是正常的（网络层应该没问题）；
3. 故障出现时，浏览器所在设备使用 `nc` 探测此 Web 平台所在 Linux 服务器的任意有监听开放端口都出现和浏览器类似的故障（传输层出现问题）；

从 `2.` 和 `3.` 可以推测，问题大概率在于传输层。HTTP 协议基于 TCP，所以大概率就是 TCP 连接建立过程出现意外。那么，如果是 UDP 协议会有问题吗？

```sh
$ nc -uv IP.IP.IP.IP 6666
Connection to IP.IP.IP.IP port 6666 [udp/*] succeeded!
```

`nc` 命令的 UDP 和 TCP 模式有个重要区别：不管 `nc` 什么端口，UDP 模式的结果总会是 `succeeded!`。但是，如果在服务器端使用 `nc` 以 UDP 模式监听端口（防火墙开放的端口），当它收到 UDP 包时会打印出 `XXX` 字符。

于是，在某次故障复现时，我以最快速度做了如下操作：

```sh
# server side
$ sudo nc -luk 0.0.0.0 6666
# waiting for the client to "connect"...
XXXX

# client side
nc -uv IP.IP.IP.IP 6666
```

在总结出上面这些现象后，我找了某云售后工程师咨询。对面询问我是否修改过服务器的 `net.ipv4.tcp_tw_reuse` 参数。我表示没有，同时也不知道这个参数的作用是什么。因此搜索了一番而找到上文提到的这篇文章，并且根据文章可以判断出问题在于启用了另外一个 ipv4 内核参数：`net.ipv4.tcp_tw_recycle`。

### 修改内核参数

`net.ipv4.tcp_tw_recycle` 这个内核参数是哪位同事启用的应该已经不可考，不过我猜他大概是为了优化 TCP 连接数而做的修改。

好消息是这个内核参数可以在 Linux 运行时修改而不必重启，[sysctl(8)](https://man7.org/linux/man-pages/man8/sysctl.8.html) 命令就是专门用来做这件事的：

```sh
sudo vim /etc/sysctl.conf

# 在 /etc/sysctl.conf 中增加如下配置，并保存退出
net.ipv4.tcp_tw_recycle = 0

# reload /etc/sysctl.conf
sudo sysctl -p
```

在更新之后，此故障再也没有出现过。

### 相关资料

这个过程中还查阅了其他资料：

- [What are the ramifications of setting tcp_tw_recycle/reuse to 1?](https://serverfault.com/questions/342741/what-are-the-ramifications-of-setting-tcp-tw-recycle-reuse-to-1). *serverfault.com*.
- [Dropping of connections with tcp_tw_recycle](https://stackoverflow.com/questions/8893888/dropping-of-connections-with-tcp-tw-recycle). *stackoverflow.com*.
- [Linux Advanced Routing & Traffic Control HOWTO - Chapter 13. Kernel network parameters - 13.2.1. Generic ipv4](https://tldp.org/HOWTO/Adv-Routing-HOWTO/lartc.kernel.obscure.html#AEN1252). *tldp.org*.

## 译文

::: info 关于原文

为了确保自己完全看明白（毕竟是改生产环境的内核网络参数），我决定将它翻译成中文。

- 原文：[Coping with the TCP TIME-WAIT state on busy Linux servers](https://vincent.bernat.ch/en/blog/2014-tcp-time-wait-state-linux)
- 作者：[Vincent Bernat](https://github.com/vincentbernat)
- 日期：2014.02.24
- 许可：根据作者网站的 [Licenses](https://vincent.bernat.ch/en/licenses) 信息，原文采用的许可证为 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。

本译文沿用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。

:::

::: warning 📌 简述

不要启用 `net.ipv4.tcp_tw_recycle`——从 Linux 4.12 开始这个参数就不存在了。大多数时候，`TIME-WAIT` 状态的套接字 (sockets) 是无害的。否则，请查看推荐解决方案的[总结](#总结)。

Linux 内核文档对于理解 `net.ipv4.tcp_tw_recycle` 和 `net.ipv4.tcp_tw_reuse` 有何作用的帮助不大。由于缺乏文档，许多调优指南建议将这两个参数都设置为 1，以减少 `TIME-WAIT` 状态的 sockets 数量。然而，正如 [tcp(7)](https://manpages.debian.org/buster/manpages/tcp.7.en.html) 手册所述，`net.ipv4.tcp_tw_recycle` 选项对于面向公众的服务器来说是相当有问题的，因为它无法处理这样的多个连接：来自同一个 NAT 设备背后的两台不同计算机。这是一个很难检测出来并且可能会随时坑你的问题：

> Enable fast recycling of TIME-WAIT sockets. Enabling this option is not recommended since this causes problems when working with NAT (Network Address Translation).
>
> 启用 `TIME-WAIT` 套接字的快速回收。不建议启用此选项，因为在使用 NAT（网络地址转换）时它会导致一些问题。

:::

下文将会更详细地解释如何正确处理 `TIME-WAIT` 状态。另外，本文讲述的是 Linux 的 TCP 协议栈。这与 *Netfilter* 连接追踪完全无关，它可以通过其他方式进行调整 [^netfilter]。

[^netfilter]: 值得注意的是，调整 `net.netfilter.nf_conntrack_tcp_timeout_time_wait` 不会改变 TCP 协议栈处理 `TIME-WAIT` 状态的方式。

## 关于 `TIME-WAIT` 状态

让我们先回顾一下什么是 `TIME-WAIT` 状态，参见下面的 TCP 状态图[^tcp_diagram]：

![TCP State Diagram](./tcp-state-diagram.svg)

[^tcp_diagram]: 该图的许可证为 [LaTeX Project Public License 1.3](https://www.latex-project.org/lppl.txt)。原始文件可在此[页面](http://www.texample.net/tikz/examples/tcp-state-machine/)上找到。

只有*先关闭连接的一端*才会进入 `TIME-WAIT` 状态。另一端则会遵循使它快速丢弃连接的路径。

你可以使用 `ss -tan` 查看当前的连接状态：

```sh
$ ss -tan | head -5
LISTEN     0  511             *:80              *:*
SYN-RECV   0  0     192.0.2.145:80    203.0.113.5:35449
SYN-RECV   0  0     192.0.2.145:80   203.0.113.27:53599
ESTAB      0  0     192.0.2.145:80   203.0.113.27:33605
TIME-WAIT  0  0     192.0.2.145:80   203.0.113.47:50685
```

### 用途

>>>>> progress

## 总结
